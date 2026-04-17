/**
 * Local-D1 reset helper. Truncates every domain table in FK-safe order via
 * `wrangler d1 execute gc-erp --local --command "DELETE FROM ..."`. Run
 * this between scenario runs; the runner does it automatically when
 * invoked with `--reset`.
 *
 * Only touches the **local** D1 (sqlite in `.wrangler/state/`). Never
 * runs against `--remote` — there's no flag, by design. A remote
 * truncate would be a disaster, and there's an open action item to add a
 * separate deny-list rule covering remote mutations.
 */

// Children before parents. SQLite DELETE respects FK cascades at the row
// level, but keeping the explicit order makes the dependency graph legible
// to anyone reading this file — and defends against the day we flip on
// `PRAGMA foreign_keys = ON` for the local binding (D1 has it on by
// default in remote, off by default locally).
const TABLES_IN_DELETE_ORDER = [
  "costs",
  "ntp_events",
  "activations",
  "commitment_scopes",
  "commitments",
  "patches",
  "documents",
  "scopes",
  "jobs",
  "activities",
  "parties",
  "projects",
] as const;

async function runWrangler(
  mcpServerDir: string,
  args: readonly string[],
  label: string,
): Promise<void> {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], {
    cwd: mcpServerDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${label} exited with code ${exitCode}`);
  }
}

export async function resetLocalD1(): Promise<void> {
  // Resolve packages/mcp-server/ from this file's location so wrangler
  // finds the right wrangler.jsonc regardless of the shell's cwd.
  const mcpServerDir = new URL("../../../mcp-server/", import.meta.url)
    .pathname;

  // Apply migrations first — idempotent, and handles the first-run case
  // where the local D1 file exists but has no schema. Wrangler reads the
  // migrations dir from the `d1_databases[0].migrations_dir` entry in
  // wrangler.jsonc.
  await runWrangler(
    mcpServerDir,
    ["d1", "migrations", "apply", "gc-erp", "--local"],
    "wrangler d1 migrations apply (local)",
  );

  const sql = TABLES_IN_DELETE_ORDER.map((t) => `DELETE FROM ${t};`).join(" ");
  await runWrangler(
    mcpServerDir,
    ["d1", "execute", "gc-erp", "--local", "--command", sql],
    "wrangler d1 execute (local truncate)",
  );
}
