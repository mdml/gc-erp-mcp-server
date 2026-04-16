/**
 * I/O primitives for agent-config scripts. Kept small and self-contained —
 * no cross-package imports. Pure composition logic lives in settings.ts.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export function die(prefix: string, msg: string): never {
  console.error(`${prefix}: ${msg}`);
  process.exit(1);
}

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch {
        // fall through
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate workspace root (no package.json with 'workspaces' found walking up from ${startDir})`,
  );
}

export function writeAtomic(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export function unlinkIfExists(path: string): boolean {
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export interface RunResult {
  stderr: string;
  exitCode: number;
}

/**
 * Subprocess runner that streams stdout/stderr to the parent. For long-running
 * commands (bun install, turbo run sync-secrets) we want the user to see
 * progress, not a silent pause.
 */
export async function runInherit(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "pipe",
    stdin: "ignore",
    cwd: opts.cwd,
    env: { ...process.env },
  });
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  // Mirror stderr so the user sees failures live.
  if (stderr) process.stderr.write(stderr);
  return { stderr, exitCode };
}
