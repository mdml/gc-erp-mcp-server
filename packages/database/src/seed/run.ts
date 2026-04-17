/**
 * CLI entry for seed scripts — thin dispatcher, excluded from coverage.
 *
 * Usage:
 *   bun run src/seed/run.ts activities
 *
 * Seed targets connect to D1 via wrangler once the D1 provider in
 * `packages/infra` has run. For now this script documents the surface; the
 * real wrangler-wired seeding lands alongside D1 provisioning.
 */

const [, , target] = process.argv;

if (!target) {
  console.error("usage: bun run src/seed/run.ts <target>");
  console.error("targets: activities");
  process.exit(2);
}

if (target !== "activities") {
  console.error(`unknown seed target: ${target}`);
  process.exit(2);
}

// TODO(M1): wire to D1 once packages/infra provisions it and mcp-server
// binds it. Seed logic lives in ./activities.ts; this entry becomes a
// wrangler-wrapper or a direct D1 HTTP caller at that point.
console.error(
  "seed: D1 provisioning pending (packages/infra). Seed logic is in src/seed/activities.ts.",
);
process.exit(1);
