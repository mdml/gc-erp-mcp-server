/**
 * Pure SQL builder for the starter-activity seed. Drives
 * `db:seed:activities:{local,prod}`: generate a `.sql` file once, hand it
 * to `wrangler d1 execute --file`, delete the file.
 *
 * Uses `INSERT OR IGNORE` keyed on the `UNIQUE (slug)` constraint — same
 * idempotency semantics as the local better-sqlite3 path
 * (packages/database/src/seed/activities.ts uses
 * `onConflictDoNothing({ target: activities.slug })`). IDs are regenerated
 * on every call; on a second run every slug conflicts, so the freshly-
 * minted IDs are harmlessly discarded.
 */

export interface ActivitySeedInput {
  id: string;
  name: string;
  slug: string;
  defaultUnit?: string;
}

/** SQLite-flavored single-quote escape: `'` → `''`. */
function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function buildActivitySeedSql(
  rows: readonly ActivitySeedInput[],
): string {
  const stmts = rows.map((r) => {
    const du = r.defaultUnit === undefined ? "NULL" : sqlLiteral(r.defaultUnit);
    return (
      `INSERT OR IGNORE INTO activities (id, name, slug, default_unit) ` +
      `VALUES (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.slug)}, ${du});`
    );
  });
  return `${stmts.join("\n")}\n`;
}
