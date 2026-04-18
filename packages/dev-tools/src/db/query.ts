#!/usr/bin/env bun
/**
 * CLI for `bun run db:query:local` / `bun run db:query:prod` — thin
 * passthrough to `wrangler d1 execute gc-erp --{local,remote} --command`.
 *
 * Usage:
 *   bun run src/db/query.ts local "SELECT count(*) FROM activities"
 *   bun run src/db/query.ts prod  "SELECT count(*) FROM activities"
 *   bun run src/db/query.ts prod  "DELETE FROM commitments WHERE voided = 1" --yes
 *
 * `:prod` scans the SQL for destructive keywords (UPDATE/DELETE/DROP/
 * TRUNCATE/ALTER) and forces a plan+confirm step. `--yes` skips the
 * interactive prompt but still prints the plan — consistent with the
 * rest of the dogfood script surface (docs/guides/dogfood.md §Plan+
 * confirm pattern).
 *
 * Excluded from coverage — thin I/O wrapper. Pure destructive detection
 * lives in `../plan-confirm.ts` and is tested there.
 */

import {
  detectDestructiveKeywords,
  type Plan,
  parseYesFlag,
  planAndConfirm,
} from "../plan-confirm";
import { runWrangler } from "../wrangler";

type Target = "local" | "prod";

interface ParsedArgs {
  target: Target;
  sql: string;
  yes: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const target = positional[0];
  const sql = positional[1];
  if ((target !== "local" && target !== "prod") || !sql) {
    console.error(
      'usage: bun run src/db/query.ts <local|prod> "<sql>" [--yes]',
    );
    process.exit(2);
  }
  return { target, sql, yes: parseYesFlag(argv) };
}

function buildPlan(sql: string, hits: readonly string[]): Plan {
  return {
    title: "db:query:prod — destructive query detected",
    actions: [
      `execute against remote D1 (gc-erp): ${sql}`,
      `keywords found: ${hits.join(", ")}`,
      "this is a production database — writes are permanent",
    ],
  };
}

async function main(): Promise<number> {
  const { target, sql, yes } = parseArgs(process.argv.slice(2));

  if (target === "prod") {
    const hits = detectDestructiveKeywords(sql);
    if (hits.length > 0) {
      const proceed = await planAndConfirm({
        plan: buildPlan(sql, hits),
        yes,
      });
      if (!proceed) {
        console.log("aborted.");
        return 0;
      }
    }
  }

  const flag = target === "local" ? "--local" : "--remote";
  try {
    await runWrangler(["d1", "execute", "gc-erp", flag, "--command", sql], {
      label: `wrangler d1 execute (${target})`,
    });
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

process.exit(await main());
