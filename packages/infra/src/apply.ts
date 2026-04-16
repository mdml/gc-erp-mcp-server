#!/usr/bin/env bun
/**
 * `bun run infra:apply` — prints a plan and exits 0.
 * `bun run infra:apply --yes` — executes the plan.
 *
 * Dry-run by default: without `--yes`, nothing is mutated. Drift is surfaced
 * as a thrown error from the planner (printed and exit 1) rather than silently
 * overwritten — we want human judgement when something is attached to the
 * wrong worker.
 *
 * Today's only provider (custom-domain) has both its action kinds
 * wrangler-managed or already-done, so `apply --yes` has no API work to do
 * here — it prints the pointer to `bun run deploy` and exits 0. Future
 * providers (D1, R2, secrets) will have real mutating paths in this file.
 */

import { infra } from "./infra.config";
import {
  applyCustomDomain,
  type CustomDomainAction,
  planCustomDomain,
} from "./providers/custom-domain";

function describe(action: CustomDomainAction): string {
  switch (action.kind) {
    case "wrangler-attach":
      return `custom-domain ${action.hostname}: ${action.reason}`;
    case "noop":
      return `skip custom-domain ${action.hostname}: ${action.reason}`;
  }
}

export async function run(argv: string[]): Promise<number> {
  const yes = argv.includes("--yes");

  const action = await planCustomDomain(infra);

  console.log("plan:");
  console.log(`  - ${describe(action)}`);

  if (!yes) {
    console.log("\ndry-run (re-run with --yes to execute)");
    if (action.kind === "wrangler-attach") {
      console.log("note: `bun run deploy` is what applies this change.");
    }
    return 0;
  }

  await applyCustomDomain(action);

  if (action.kind === "wrangler-attach") {
    console.log(
      "\ncustom-domain attachment is wrangler-managed \u2014 run `bun run deploy` to attach.",
    );
  } else {
    console.log("\nnothing to do");
  }
  return 0;
}

if (import.meta.main) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
