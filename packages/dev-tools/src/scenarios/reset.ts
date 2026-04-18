/**
 * Local-D1 reset helper. Truncates every domain table in FK-safe order via
 * `wrangler d1 execute gc-erp --local --command "DELETE FROM ..."`. Run
 * this between scenario runs; the runner does it automatically when
 * invoked with `--reset`. The same helper backs `bun run db:reset:local`
 * via a plan-confirm wrapper in `src/db/reset.ts`.
 *
 * Only touches the **local** D1 (sqlite in `.wrangler/state/`). Never
 * runs against `--remote` — there's no flag, by design. Resetting prod
 * means deleting real job history; that's an incident-recovery operation,
 * not a routine script (see docs/guides/dogfood.md §Database — reset).
 */

import { runWrangler } from "../wrangler";

// Children before parents. SQLite DELETE respects FK cascades at the row
// level, but keeping the explicit order makes the dependency graph legible
// to anyone reading this file — and defends against the day we flip on
// `PRAGMA foreign_keys = ON` for the local binding (D1 has it on by
// default in remote, off by default locally).
export const LOCAL_TABLES_IN_DELETE_ORDER = [
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

export async function resetLocalD1(): Promise<void> {
  // Apply migrations first — idempotent, and handles the first-run case
  // where the local D1 file exists but has no schema. Wrangler reads the
  // migrations dir from the `d1_databases[0].migrations_dir` entry in
  // wrangler.jsonc.
  await runWrangler(["d1", "migrations", "apply", "gc-erp", "--local"], {
    label: "wrangler d1 migrations apply (local)",
  });

  const sql = LOCAL_TABLES_IN_DELETE_ORDER.map((t) => `DELETE FROM ${t};`).join(
    " ",
  );
  await runWrangler(["d1", "execute", "gc-erp", "--local", "--command", sql], {
    label: "wrangler d1 execute (local truncate)",
  });
}
