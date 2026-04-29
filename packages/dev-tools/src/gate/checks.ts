/**
 * Gate check definitions — runs subprocesses and captures results.
 *
 * The gate is now lint + typecheck + test only. Code Health is a separate
 * lefthook hook (pre-commit + pre-push) wired to scripts/codescene.sh per
 * ADR 0015. This keeps the bash-wrapped cs invocation off the bun-driven
 * gate path, which deadlocked when lefthook + Bun.spawn(Promise.all) + cs
 * tried to share a process tree.
 */

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

  return results;
}
