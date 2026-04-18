#!/usr/bin/env bun
/**
 * CLI for `bun run db:reset:local` — plan+confirm then truncate every
 * domain table in the local D1 and re-apply migrations. `--yes` skips
 * the prompt; the plan still prints.
 *
 * Local-only by design. No `db:reset:prod` — see docs/guides/dogfood.md
 * §Database — reset (local only).
 *
 * Excluded from coverage — thin wrapper over the pure plan helper and
 * the existing `resetLocalD1` orchestrator.
 */

import { parseYesFlag, planAndConfirm } from "../plan-confirm";
import { LOCAL_TABLES_IN_DELETE_ORDER, resetLocalD1 } from "../scenarios/reset";

async function main(): Promise<number> {
  const yes = parseYesFlag(process.argv.slice(2));

  const proceed = await planAndConfirm({
    plan: {
      title: "db:reset:local",
      actions: [
        `truncate ${LOCAL_TABLES_IN_DELETE_ORDER.length} tables (${LOCAL_TABLES_IN_DELETE_ORDER.join(", ")})`,
        "re-apply pending migrations",
      ],
    },
    yes,
  });
  if (!proceed) {
    console.log("aborted.");
    return 0;
  }

  try {
    await resetLocalD1();
    console.log("✓ local D1 reset");
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

process.exit(await main());
