/**
 * Gate check definitions — runs subprocesses and captures results.
 */

import { join } from "node:path";
import { REPO_ROOT } from "../root";

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export async function runCheck(
  name: string,
  cmd: string[],
): Promise<CheckResult> {
  const start = performance.now();

  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: REPO_ROOT,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    const durationMs = Math.round(performance.now() - start);

    return {
      name,
      passed: exitCode === 0,
      output: stdout + stderr,
      durationMs,
    };
  } catch (e) {
    const durationMs = Math.round(performance.now() - start);
    return {
      name,
      passed: false,
      output: e instanceof Error ? e.message : String(e),
      durationMs,
    };
  }
}

const CODE_HEALTH_NAME = "Code Health (all files \u2265 10.0)";
export const SOURCE_PATTERN = /\.(ts|tsx|js|jsx|mjs)$/;
export const TEST_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/;

export async function isCsAvailable(): Promise<boolean> {
  const proc = Bun.spawn(["which", "cs"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

export const CS_MISSING_MSG = [
  "CodeScene CLI (cs) is not installed \u2014 Code Health check cannot run.",
  "Install with: npm i -g @codescene/codescene-cli",
].join("\n");

export const TOKEN_MISSING_MSG = [
  "CS_ACCESS_TOKEN not set \u2014 Code Health check cannot run.",
  "Add its op:// ref to /.env.op.local and re-run `turbo run sync-secrets`.",
].join("\n");

export const UNMEASURED_MSG = [
  "cs check produced no score for one or more files \u2014 likely CodeScene auth or connectivity failure.",
  "Verify CS_ACCESS_TOKEN is valid and CodeScene is reachable.",
].join("\n");

/**
 * Parse `cs check` stdout. Three possible outcomes:
 *   - numeric score: the file was scored; compare against threshold.
 *   - "N/A": cs ran successfully but the file is too trivial to score
 *     (small CLI entries, config files, pure-data modules). Pass, not a
 *     violation.
 *   - null: no "Code health score:" line at all — cs didn't run to completion
 *     (auth failure, connectivity, etc). Fail.
 */
export interface ParsedHealth {
  score: string | null;
  warnings: string[];
}

export function parseCodeHealthOutput(output: string): ParsedHealth {
  const match = output.match(/Code health score: (N\/A|[0-9.]+)/);
  const warnings = output
    .split("\n")
    .filter((l) => l.startsWith("warn:"))
    .slice(0, 5);
  return {
    score: match ? match[1] : null,
    warnings,
  };
}

async function getChangedSourceFiles(): Promise<string[]> {
  const spawnOpts = {
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    cwd: REPO_ROOT,
  };

  // All files changed across the branch (vs main), not just the last commit.
  const branchDiff = Bun.spawn(
    ["git", "diff", "--name-only", "main...HEAD"],
    spawnOpts,
  );
  const branchFiles = await new Response(branchDiff.stdout).text();
  await branchDiff.exited;

  // Also include uncommitted changes (staged + unstaged).
  const workingDiff = Bun.spawn(
    ["git", "diff", "--name-only", "HEAD"],
    spawnOpts,
  );
  const workingFiles = await new Response(workingDiff.stdout).text();
  await workingDiff.exited;

  return [
    ...new Set(
      `${branchFiles}\n${workingFiles}`
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => SOURCE_PATTERN.test(f) && !TEST_PATTERN.test(f)),
    ),
  ];
}

export type FileHealth =
  | { kind: "skipped"; file: string }
  | { kind: "not-applicable"; file: string }
  | { kind: "ok"; file: string }
  | { kind: "fail"; file: string; message: string }
  | { kind: "unmeasured"; file: string };

export async function checkFileHealth(file: string): Promise<FileHealth> {
  const absPath = join(REPO_ROOT, file);
  const exists = await Bun.file(absPath).exists();
  if (!exists) return { kind: "skipped", file };

  const proc = Bun.spawn(["cs", "check", absPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const parsed = parseCodeHealthOutput(output);
  if (parsed.score === null) return { kind: "unmeasured", file };
  if (parsed.score === "N/A") return { kind: "not-applicable", file };
  if (Number.parseFloat(parsed.score) >= 10) return { kind: "ok", file };
  return {
    kind: "fail",
    file,
    message: `${file}: ${parsed.score}\n${parsed.warnings.join("\n")}`,
  };
}

/**
 * Run the code health check on recently changed files. Hard-fails on:
 *   - `cs` not installed
 *   - `CS_ACCESS_TOKEN` unset
 *   - cs ran but produced no score for any file (auth/connectivity failure)
 *   - any file score < 10
 */
async function runCodeHealthCheck(): Promise<CheckResult> {
  if (!(await isCsAvailable())) {
    return {
      name: CODE_HEALTH_NAME,
      passed: false,
      output: CS_MISSING_MSG,
      durationMs: 0,
    };
  }

  if (!process.env.CS_ACCESS_TOKEN) {
    return {
      name: CODE_HEALTH_NAME,
      passed: false,
      output: TOKEN_MISSING_MSG,
      durationMs: 0,
    };
  }

  const start = performance.now();
  const sourceFiles = await getChangedSourceFiles();

  if (sourceFiles.length === 0) {
    return {
      name: CODE_HEALTH_NAME,
      passed: true,
      output: "No source files to check",
      durationMs: Math.round(performance.now() - start),
    };
  }

  const results = await Promise.all(sourceFiles.map(checkFileHealth));
  const unmeasured = results.filter(
    (r): r is Extract<FileHealth, { kind: "unmeasured" }> =>
      r.kind === "unmeasured",
  );
  const failures = results.filter(
    (r): r is Extract<FileHealth, { kind: "fail" }> => r.kind === "fail",
  );

  if (unmeasured.length > 0) {
    return {
      name: CODE_HEALTH_NAME,
      passed: false,
      output: [
        UNMEASURED_MSG,
        ...unmeasured.map((r) => `  \u2022 ${r.file}`),
      ].join("\n"),
      durationMs: Math.round(performance.now() - start),
    };
  }

  return {
    name: CODE_HEALTH_NAME,
    passed: failures.length === 0,
    output:
      failures.length > 0
        ? failures.map((r) => r.message).join("\n")
        : "All files score \u2265 10.0",
    durationMs: Math.round(performance.now() - start),
  };
}

export interface GateCheck {
  name: string;
  cmd: string[];
}

export function getGateChecks(coverage: boolean): GateCheck[] {
  return [
    { name: "TypeScript (all)", cmd: ["bunx", "turbo", "typecheck"] },
    { name: "Lint (all)", cmd: ["bunx", "turbo", "lint"] },
    {
      name: coverage ? "Tests + Coverage" : "Tests (all)",
      cmd: coverage
        ? ["bunx", "turbo", "test:coverage"]
        : ["bunx", "turbo", "test"],
    },
  ];
}

export async function runAllChecks(coverage = false): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of getGateChecks(coverage)) {
    const result = await runCheck(check.name, check.cmd);
    results.push(result);
  }

  const codeHealthResult = await runCodeHealthCheck();
  results.push(codeHealthResult);

  return results;
}
