import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { activities } from "../schema/activities";
import { buildActivitySeedRows, seedActivities } from "./activities";
import { STARTER_ACTIVITIES } from "./data/activities";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function fresh(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/migrations" });
  return db;
}

describe("buildActivitySeedRows", () => {
  it("mints one row per starter activity with unique slugs", () => {
    const rows = buildActivitySeedRows();
    expect(rows).toHaveLength(STARTER_ACTIVITIES.length);
    const slugs = new Set(rows.map((r) => r.slug));
    expect(slugs.size).toBe(rows.length);
    for (const r of rows) {
      expect(r.id.startsWith("act_")).toBe(true);
    }
  });
});

describe("seedActivities (idempotency)", () => {
  let db: Db;
  beforeEach(() => {
    db = fresh();
  });

  const count = () =>
    db.select({ n: sql<number>`count(*)` }).from(activities).get()?.n ?? 0;

  it("inserts 22 rows on first run", () => {
    seedActivities(db);
    expect(count()).toBe(STARTER_ACTIVITIES.length);
  });

  it("is a no-op on second run (same slugs)", () => {
    seedActivities(db);
    const first = count();
    seedActivities(db);
    expect(count()).toBe(first);
    // Starter slugs present exactly once each.
    for (const starter of STARTER_ACTIVITIES) {
      const rows = db
        .select()
        .from(activities)
        .where(sql`${activities.slug} = ${starter.slug}`)
        .all();
      expect(rows).toHaveLength(1);
    }
  });
});
