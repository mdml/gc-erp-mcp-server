/**
 * Tooling-only barrel — exposes seed data + row-building helpers to
 * `@gc-erp/dev-tools` CLIs (`db:seed:activities:{local,prod}`). Runtime
 * code (mcp-server) never imports from this path; it's reached via the
 * `"./seed"` subpath export in package.json.
 *
 * Kept separate from `./src/index.ts` so the Worker bundle never picks up
 * seed data or tooling-only helpers.
 */

export type { ActivitySeedRow } from "./activities";
export { buildActivitySeedRows, seedActivities } from "./activities";
export type { StarterActivity } from "./data/activities";
export { STARTER_ACTIVITIES } from "./data/activities";
