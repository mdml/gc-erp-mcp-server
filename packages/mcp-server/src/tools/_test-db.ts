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

  // drizzle-d1 exposes `.batch([...])` with all-or-nothing semantics; the
  // better-sqlite3 adapter does not. `apply_patch` and any future tool that
  // relies on batched atomicity per ADR 0008 needs the method on the test
  // client too. Polyfill it using a native better-sqlite3 BEGIN/COMMIT —
  // all queries in the same SQLite connection run inside the transaction,
  // so the existing thenable query builders fold in without rebuilding.
  const anyDb = db as unknown as {
    batch: (queries: readonly unknown[]) => Promise<unknown[]>;
  };
  anyDb.batch = async (queries) => {
    sqlite.exec("BEGIN");
    try {
      const results: unknown[] = [];
      for (const q of queries) results.push(await (q as Promise<unknown>));
      sqlite.exec("COMMIT");
      return results;
    } catch (err) {
      sqlite.exec("ROLLBACK");
      throw err;
    }
  };

  return db as unknown as DatabaseClient;
}
