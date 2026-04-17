import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { newActivityId } from "../ids/generate";
import type * as schema from "../schema";
import { activities } from "../schema/activities";
import type { ActivityId } from "../schema/ids";
import { STARTER_ACTIVITIES } from "./data/activities";

export interface ActivitySeedRow {
  id: ActivityId;
  name: string;
  slug: string;
  defaultUnit?: string;
}

/**
 * Mint a fresh row per starter activity. IDs are fresh every call —
 * idempotency comes from the `ON CONFLICT (slug) DO NOTHING` clause, not
 * from stable IDs.
 */
export function buildActivitySeedRows(): ActivitySeedRow[] {
  return STARTER_ACTIVITIES.map((a) => ({
    id: newActivityId(),
    name: a.name,
    slug: a.slug,
    ...(a.defaultUnit ? { defaultUnit: a.defaultUnit } : {}),
  }));
}

/**
 * Idempotent seed for the starter activity library. First call inserts all
 * starter rows; subsequent calls no-op because each row's `slug` already
 * exists. Typed against `BetterSQLite3Database` — that's what tests + local
 * dev-loop scripts use. The D1 variant lands alongside D1 provisioning in
 * `packages/infra`; both share `buildActivitySeedRows` + the same INSERT.
 */
export function seedActivities(db: BetterSQLite3Database<typeof schema>): void {
  const rows = buildActivitySeedRows();
  db.insert(activities)
    .values(rows)
    .onConflictDoNothing({ target: activities.slug })
    .run();
}
