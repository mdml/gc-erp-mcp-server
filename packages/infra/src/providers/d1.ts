/**
 * D1 provider — check / plan / apply / teardown.
 *
 * D1 databases are fully API-provisionable: creation + deletion both go through
 * the REST API (no wrangler needed). After `apply`, the binding entry is written
 * into packages/mcp-server/wrangler.jsonc via jsonc-parser so comments survive.
 *
 * Binding shape written to wrangler.jsonc:
 *   d1_databases: [{
 *     binding: "DB",
 *     database_name: "...",
 *     database_id: "...",
 *     migrations_dir: "../database/src/migrations",
 *   }]
 *
 * `migrations_dir` is resolved by wrangler relative to wrangler.jsonc's own
 * directory (packages/mcp-server/), so the literal string points at
 * packages/database/src/migrations/. Keeping the path in the binding means
 * `wrangler d1 migrations apply <db> --remote` finds our SQL without a flag.
 */

import type { InfraConfig } from "../infra.config";
import { accountPath, cf } from "../lib/cloudflare-client";
import { patchWranglerJsonc } from "../lib/wrangler-patcher";

export interface D1Database {
  uuid: string;
  name: string;
  created_at: string;
  version: string;
  num_tables: number;
  file_size: number;
}

export type D1Status =
  | { kind: "exists"; database: D1Database }
  | { kind: "missing"; databaseName: string };

export type D1Action =
  | { kind: "create"; databaseName: string }
  | { kind: "noop"; databaseName: string; reason: string };

export async function checkD1(config: InfraConfig): Promise<D1Status> {
  const { databaseName } = config.d1;
  const databases = await cf<D1Database[]>(
    "GET",
    accountPath(`/d1/database?name=${encodeURIComponent(databaseName)}`),
  );
  const db = (databases ?? []).find((d) => d.name === databaseName);
  if (!db) return { kind: "missing", databaseName };
  return { kind: "exists", database: db };
}

export async function planD1(config: InfraConfig): Promise<D1Action> {
  const status = await checkD1(config);
  const { databaseName } = config.d1;
  if (status.kind === "exists") {
    return {
      kind: "noop",
      databaseName,
      reason: `already exists (uuid=${status.database.uuid})`,
    };
  }
  return { kind: "create", databaseName };
}

export async function applyD1(action: D1Action): Promise<void> {
  if (action.kind === "noop") return;
  // NOTE: Overwrites d1_databases as a single-entry array. If infra.config.ts ever
  // holds >1 D1 spec, change patchWranglerJsonc here to merge-append, not replace.
  // NOTE: Partial-failure — if POST succeeds but patchWranglerJsonc throws, the DB
  // exists in CF with no binding in wrangler.jsonc. Fix: add it manually, or teardown + re-apply.
  const db = await cf<D1Database>("POST", accountPath("/d1/database"), {
    name: action.databaseName,
  });
  patchWranglerJsonc([
    {
      path: ["d1_databases"],
      value: [
        {
          binding: "DB",
          database_name: db.name,
          database_id: db.uuid,
          migrations_dir: "../database/src/migrations",
        },
      ],
    },
  ]);
}

export async function teardownD1(
  config: InfraConfig,
): Promise<"deleted" | "not-found"> {
  const status = await checkD1(config);
  if (status.kind === "missing") return "not-found";
  await cf("DELETE", accountPath(`/d1/database/${status.database.uuid}`));
  return "deleted";
}
