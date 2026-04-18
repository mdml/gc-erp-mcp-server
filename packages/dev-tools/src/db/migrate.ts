#!/usr/bin/env bun
/**
 * CLI for `bun run db:migrate:local` / `bun run db:migrate:prod` — pure
 * passthrough to `wrangler d1 migrations apply gc-erp --{local,remote}`.
 * No plan+confirm here: wrangler prints its own migration diff and prompts
 * for confirmation when running against `--remote` interactively.
 *
 * Usage:
 *   bun run src/db/migrate.ts local
 *   bun run src/db/migrate.ts prod
 *
 * Excluded from coverage — thin argv dispatcher plus a subprocess spawn.
 */

import { runWrangler } from "../wrangler";

type Target = "local" | "prod";

function parseTarget(argv: readonly string[]): Target {
  const target = argv[0];
  if (target !== "local" && target !== "prod") {
    console.error("usage: bun run src/db/migrate.ts <local|prod>");
    process.exit(2);
  }
  return target;
}

async function main(): Promise<number> {
  const target = parseTarget(process.argv.slice(2));
  const wranglerFlag = target === "local" ? "--local" : "--remote";
  try {
    await runWrangler(["d1", "migrations", "apply", "gc-erp", wranglerFlag], {
      label: `wrangler d1 migrations apply (${target})`,
    });
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

process.exit(await main());
