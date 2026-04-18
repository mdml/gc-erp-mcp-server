/**
 * CLI entry for the kitchen-fixture seed — thin dispatcher, excluded
 * from coverage.
 *
 * Usage:
 *   bun run src/seed/run.ts kitchen-fixture
 *
 * Wired via `db:seed:kitchen:local` at both the package and root level.
 * The activity-library seed lives in `@gc-erp/dev-tools` now
 * (`db:seed:activities:{local,prod}`) — it drives `wrangler d1 execute`
 * and needs orchestration that doesn't belong in the runtime-runtime
 * database package.
 *
 * Seeding here still expects a D1 binding that this process can reach;
 * until packages/infra wires that up end-to-end, this CLI surfaces an
 * explicit error — the seed *logic* lives in `./kitchen-fixture.ts` and
 * is covered by `kitchen-fixture.test.ts` against better-sqlite3.
 */

const KNOWN_TARGETS = ["kitchen-fixture"] as const;

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

// TODO(M3): wire to D1 once a Bun-reachable D1 client exists. Seed logic
// lives in `./kitchen-fixture.ts`; this entry becomes a wrangler-driven
// SQL emitter at that point, mirroring the activities path in dev-tools.
console.error(
  `seed(${target}): D1 provisioning pending. ` +
    `Seed logic is in src/seed/${target}.ts and is exercised by ` +
    `${target}.test.ts against in-memory sqlite.`,
);
process.exit(1);
