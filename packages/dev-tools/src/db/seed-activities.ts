#!/usr/bin/env bun
/**
 * CLI for `bun run db:seed:activities:local` / `:prod`.
 *
 * Strategy — identical flow for both targets, symmetric dogfood shape:
 *   1. Mint a fresh row per starter activity (fresh `act_…` IDs).
 *   2. Render `INSERT OR IGNORE` SQL via `buildActivitySeedSql` (pure).
 *   3. Write to a temp `.sql` file in os.tmpdir().
 *   4. Shell out to `wrangler d1 execute gc-erp --{local|remote}
 *      --file <tmp> --yes`.
 *   5. Always unlink the temp file, even on failure.
 *
 * Idempotency comes from the `UNIQUE (slug)` constraint — re-runs find
 * every slug already present and discard the freshly-minted IDs.
 *
 * `:prod` goes through plan+confirm (prints the SQL path + row count).
 * `--yes` skips the interactive prompt; the plan still prints.
 *
 * Thin I/O — excluded from coverage. Pure pieces tested separately:
 *   - `buildActivitySeedSql` in seed-activities-sql.test.ts
 *   - `planAndConfirm`/`parseYesFlag` in plan-confirm.test.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newActivityId } from "@gc-erp/database/ids";
import { STARTER_ACTIVITIES } from "@gc-erp/database/seed";

import { parseYesFlag, planAndConfirm } from "../plan-confirm";
import { runWrangler } from "../wrangler";
import {
  type ActivitySeedInput,
  buildActivitySeedSql,
} from "./seed-activities-sql";

type Target = "local" | "prod";

function parseTarget(argv: readonly string[]): Target {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const target = positional[0];
  if (target !== "local" && target !== "prod") {
    console.error(
      "usage: bun run src/db/seed-activities.ts <local|prod> [--yes]",
    );
    process.exit(2);
  }
  return target;
}

/**
 * Mints fresh `act_…` IDs on every call. Idempotency rides on the
 * `UNIQUE (slug)` constraint + `INSERT OR IGNORE` — so whoever runs
 * `db:seed:activities:prod` *first* permanently fixes the activity IDs
 * in prod. Subsequent runs no-op regardless of the IDs they generated.
 */
function buildRows(): ActivitySeedInput[] {
  return STARTER_ACTIVITIES.map((a) => ({
    id: newActivityId(),
    name: a.name,
    slug: a.slug,
    ...(a.defaultUnit === undefined ? {} : { defaultUnit: a.defaultUnit }),
  }));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const target = parseTarget(argv);
  const yes = parseYesFlag(argv);

  const rows = buildRows();
  const sql = buildActivitySeedSql(rows);

  const tmpDir = mkdtempSync(join(tmpdir(), "gc-erp-seed-activities-"));
  const sqlPath = join(tmpDir, "activities.sql");
  writeFileSync(sqlPath, sql);

  if (target === "prod") {
    const proceed = await planAndConfirm({
      plan: {
        title: "db:seed:activities:prod",
        actions: [
          `insert ${rows.length} starter activities into remote D1 (gc-erp)`,
          "idempotent: INSERT OR IGNORE keyed on UNIQUE (slug)",
          `sql file: ${sqlPath}`,
        ],
      },
      yes,
    });
    if (!proceed) {
      rmSync(tmpDir, { recursive: true, force: true });
      console.log("aborted.");
      return 0;
    }
  }

  const flag = target === "local" ? "--local" : "--remote";
  try {
    await runWrangler(
      ["d1", "execute", "gc-erp", flag, "--file", sqlPath, "--yes"],
      { label: `wrangler d1 execute --file (${target})` },
    );
    console.log(`✓ seeded ${rows.length} activities (${target})`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

process.exit(await main());
