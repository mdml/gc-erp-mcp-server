/**
 * CLI entry for seed scripts — thin dispatcher, excluded from coverage.
 *
 * Usage:
 *   bun run src/seed/run.ts <target>
 *
 * Targets:
 *   activities        — SPEC §1 starter activity library (idempotent)
 *   kitchen-fixture   — SPEC §2 walkthrough (Day 0–Day 18, idempotent)
 *
 * Seed targets connect to D1 via wrangler once the D1 provider in
 * `packages/infra` has run. Until that lands, this CLI surfaces an explicit
 * error — the seeding *logic* is tested in `*.test.ts` against better-sqlite3
 * with the same schema, so correctness confidence doesn't depend on D1 being
 * reachable.
 */

const KNOWN_TARGETS = ["activities", "kitchen-fixture"] as const;

const [, , target] = process.argv;

if (!target) {
  console.error("usage: bun run src/seed/run.ts <target>");
  console.error(`targets: ${KNOWN_TARGETS.join(", ")}`);
  process.exit(2);
}

if (!KNOWN_TARGETS.includes(target as (typeof KNOWN_TARGETS)[number])) {
  console.error(`unknown seed target: ${target}`);
  console.error(`targets: ${KNOWN_TARGETS.join(", ")}`);
  process.exit(2);
}

// TODO(M1): wire to D1 once packages/infra provisions it and mcp-server
// binds it. Seed logic lives in ./activities.ts and ./kitchen-fixture.ts;
// this entry becomes a wrangler-wrapper or a direct D1 HTTP caller at that
// point.
console.error(
  `seed(${target}): D1 provisioning pending (packages/infra). ` +
    `Seed logic is in src/seed/${target === "activities" ? "activities" : "kitchen-fixture"}.ts.`,
);
process.exit(1);
