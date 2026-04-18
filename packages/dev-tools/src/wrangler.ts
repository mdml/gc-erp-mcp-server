/**
 * Tiny wrangler-spawn wrapper used by dogfood-script CLIs (db:migrate,
 * db:query, db:reset, db:seed:activities, …). All of these shell out to
 * `bunx wrangler <subcommand>` with stdout/stderr inherited so the user
 * sees real-time output.
 *
 * Excluded from coverage per the repo's "mock boundaries, not
 * collaborators" policy — the interesting logic in each caller is the
 * *argv composition*, which is tested at the pure-helper level. This
 * module is the orchestrator only.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to `packages/mcp-server/` — wrangler resolves
 * `wrangler.jsonc`, the `d1_databases` binding, and the `migrations_dir`
 * from this directory. Computed from `import.meta.url` so the helper
 * works regardless of the shell's cwd.
 */
export function mcpServerDir(): string {
  // src/wrangler.ts → packages/dev-tools/src/ → packages/mcp-server/
  return dirname(fileURLToPath(new URL("../../mcp-server/", import.meta.url)));
}

export interface RunWranglerOpts {
  /** Extra env to merge over the parent's env (for wrangler CI-mode hints). */
  env?: Record<string, string>;
  /** Override label used in the error message on non-zero exit. */
  label?: string;
}

export async function runWrangler(
  args: readonly string[],
  opts: RunWranglerOpts = {},
): Promise<void> {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], {
    cwd: mcpServerDir(),
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const label = opts.label ?? `wrangler ${args.join(" ")}`;
    throw new Error(`${label} exited with code ${exitCode}`);
  }
}
