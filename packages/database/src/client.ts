import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Typed drizzle-D1 client factory. Wire the D1 binding from a Worker
 * (`env.DB`) into this once per request to get a fully-typed query API.
 *
 * Tests use `drizzle-orm/better-sqlite3` with the same schema — see
 * `src/schema/_test-db.ts` (added alongside the seed idempotency test).
 */
export function createDatabaseClient(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
