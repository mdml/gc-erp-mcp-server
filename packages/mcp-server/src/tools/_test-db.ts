/**
 * Test harness: in-memory sqlite + drizzle with the production schema.
 *
 * Mirrors `packages/database/src/seed/activities.test.ts` and
 * `src/schema/integration.test.ts` — same pattern, applied here so tool
 * handlers can exercise a real SQL round-trip without workerd/Miniflare
 * (forbidden by packages/mcp-server/CLAUDE.md §Testing).
 *
 * Thin factory; excluded from coverage in vitest.config.ts.
 */

import type { DatabaseClient } from "@gc-erp/database";
import * as schema from "@gc-erp/database/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export function createTestDb(): DatabaseClient {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  // Path is resolved relative to the test runner's cwd (packages/mcp-server).
  migrate(db, {
    migrationsFolder: "../database/src/migrations",
  });
  // drizzle-d1 and drizzle-better-sqlite3 share the same query-builder
  // surface; the cast lets handlers type against DatabaseClient (the runtime
  // type) while tests feed in the sync sqlite variant.
  return db as unknown as DatabaseClient;
}
