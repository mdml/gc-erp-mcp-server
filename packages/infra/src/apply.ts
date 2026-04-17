#!/usr/bin/env bun
/**
 * `bun run infra:apply` — prints a plan and exits 0.
 * `bun run infra:apply --yes` — executes the plan.
 *
 * Dry-run by default: without `--yes`, nothing is mutated. Drift in any
 * provider surfaces as a thrown error (printed and exit 1) rather than
 * silently overwritten.
 *
 * After D1/R2 are created, their binding IDs are written back to
 * packages/mcp-server/wrangler.jsonc. Run `bun run deploy` to apply.
 */

import { infra } from "./infra.config";
import {
  applyCustomDomain,
  type CustomDomainAction,
  planCustomDomain,
} from "./providers/custom-domain";
import { applyD1, type D1Action, planD1 } from "./providers/d1";
import { applyR2, planR2, type R2Action } from "./providers/r2";

function describeCustomDomain(action: CustomDomainAction): string {
  switch (action.kind) {
    case "wrangler-attach":
      return `custom-domain ${action.hostname}: ${action.reason}`;
    case "noop":
      return `skip custom-domain ${action.hostname}: ${action.reason}`;
  }
}

function describeD1(action: D1Action): string {
  switch (action.kind) {
    case "create":
      return `create d1 database ${action.databaseName}`;
    case "noop":
      return `skip d1 ${action.databaseName}: ${action.reason}`;
  }
}

function describeR2(action: R2Action): string {
  switch (action.kind) {
    case "create":
      return `create r2 bucket ${action.bucketName}`;
    case "noop":
      return `skip r2 ${action.bucketName}: ${action.reason}`;
  }
}

export async function run(argv: string[]): Promise<number> {
  const yes = argv.includes("--yes");

  const cdAction = await planCustomDomain(infra);
  const d1Action = await planD1(infra);
  const r2Action = await planR2(infra);

  console.log("plan:");
  console.log(`  - ${describeCustomDomain(cdAction)}`);
  console.log(`  - ${describeD1(d1Action)}`);
  console.log(`  - ${describeR2(r2Action)}`);

  if (!yes) {
    console.log("\ndry-run (re-run with --yes to execute)");
    return 0;
  }

  await applyCustomDomain(cdAction);
  await applyD1(d1Action);
  await applyR2(r2Action);

  const needsDeploy =
    cdAction.kind === "wrangler-attach" ||
    d1Action.kind === "create" ||
    r2Action.kind === "create";

  if (needsDeploy) {
    console.log(
      "\nwrangler.jsonc updated — run `bun run deploy` to apply bindings.",
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
