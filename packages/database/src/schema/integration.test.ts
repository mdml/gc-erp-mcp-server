/**
 * All-tables round-trip smoke test. Inserts one row in each table of the
 * M1 schema via drizzle (better-sqlite3), walking the FK graph in dependency
 * order. Fulfills three purposes:
 *
 *   (1) Proves every column + FK callback evaluates against real SQL (drizzle's
 *       `.references(() => other.id)` arrows are lazy — they don't fire until
 *       something resolves them).
 *   (2) Forces FK-arrow resolution explicitly via `getTableConfig` so test
 *       coverage reflects the schema's FK graph rather than the subset of
 *       arrows a single insert happens to walk.
 *   (3) Serves as a schema-graph smoke test: if one FK points at a removed
 *       column or a wrong type, this test throws at migration or insert time.
 *
 * Real D1 integration lives in `apps/mcp-server` once tools come online.
 */

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { patchIdFor } from "../patches/hash";
import * as schema from ".";
import {
  activations,
  activities,
  commitmentScopes,
  commitments,
  costs,
  documents,
  jobs,
  ntpEvents,
  parties,
  patches,
  projects,
  scopes,
} from ".";
import type { IsoDate } from "./common";
import { documentIdFor } from "./documents";
import type { CommitmentEdit } from "./patches";

const usd = (cents: number) => ({ cents, currency: "USD" as const });

function fresh() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/migrations" });
  return db;
}

type Db = ReturnType<typeof fresh>;

const ids = {
  projectId: "proj_kitchen" as schema.ProjectId,
  jobId: "job_kitchen" as schema.JobId,
  partyId: "party_rogelio" as schema.PartyId,
  clientId: "party_me" as schema.PartyId,
  activityId: "act_frame" as schema.ActivityId,
  rootScopeId: "scope_kitchen" as schema.ScopeId,
  childScopeId: "scope_framing" as schema.ScopeId,
  commitmentId: "cm_frame" as schema.CommitmentId,
  activationId: "actv_frame" as schema.ActivationId,
  costId: "cost_1" as schema.CostId,
  ntpId: "ntp_1" as schema.NTPEventId,
  docSha: "b".repeat(64),
} as const;
const docId = documentIdFor(ids.docSha);

function insertProjectAndParties(db: Db) {
  db.insert(projects)
    .values({ id: ids.projectId, name: "Kitchen Remodel", slug: "main-st" })
    .run();
  db.insert(parties)
    .values([
      { id: ids.partyId, kind: "org", name: "Rogelio's Framing" },
      { id: ids.clientId, kind: "person", name: "Max" },
    ])
    .run();
}

function insertJobAndActivity(db: Db) {
  db.insert(jobs)
    .values({
      id: ids.jobId,
      projectId: ids.projectId,
      name: "Kitchen",
      slug: "kitchen",
      clientPartyId: ids.clientId,
      address: "123 Main St",
      startedOn: "2026-04-18",
    })
    .run();
  db.insert(activities)
    .values({
      id: ids.activityId,
      name: "Frame",
      slug: "frame",
      defaultUnit: "lf",
    })
    .run();
}

function insertScopes(db: Db) {
  db.insert(scopes)
    .values([
      {
        id: ids.rootScopeId,
        jobId: ids.jobId,
        name: "Kitchen",
        spec: { materials: [] },
      },
      {
        id: ids.childScopeId,
        jobId: ids.jobId,
        parentId: ids.rootScopeId,
        name: "Framing",
        code: "06-10",
        spec: {
          materials: [{ description: "2x4 studs", quantity: 40, unit: "ea" }],
        },
      },
    ])
    .run();
}

function insertCommitmentAndActivation(db: Db) {
  db.insert(commitments)
    .values({
      id: ids.commitmentId,
      jobId: ids.jobId,
      counterpartyId: ids.partyId,
      price: { kind: "lump", total: usd(700_000) },
      signedOn: "2026-04-18",
    })
    .run();
  db.insert(activations)
    .values({
      id: ids.activationId,
      commitmentId: ids.commitmentId,
      activityId: ids.activityId,
      scopeId: ids.childScopeId,
      pricePortionCents: 700_000,
      leadTimeDays: 3,
      buildTimeDays: 3,
      throughput: { units: 20, per: "day", unit: "lf" },
    })
    .run();
  db.insert(commitmentScopes)
    .values({ commitmentId: ids.commitmentId, scopeId: ids.childScopeId })
    .run();
}

function insertNtpAndDocument(db: Db) {
  db.insert(ntpEvents)
    .values({
      id: ids.ntpId,
      activationId: ids.activationId,
      issuedOn: "2026-04-27",
    })
    .run();
  db.insert(documents)
    .values({
      id: docId,
      sha256: ids.docSha,
      mimeType: "application/pdf",
      originalFilename: "invoice.pdf",
      sizeBytes: 4321,
      uploadedAt: "2026-05-04T10:00:00Z",
      uploadedBy: ids.clientId,
      jobId: ids.jobId,
      tags: ["invoice"],
    })
    .run();
}

function insertCost(db: Db) {
  db.insert(costs)
    .values({
      id: ids.costId,
      jobId: ids.jobId,
      scopeId: ids.childScopeId,
      commitmentId: ids.commitmentId,
      activityId: ids.activityId,
      activationId: ids.activationId,
      counterpartyId: ids.partyId,
      amountCents: 48_000,
      incurredOn: "2026-05-04",
      source: {
        kind: "invoice",
        invoiceNumber: "LY-7791",
        receivedOn: "2026-05-04",
        documentId: docId,
      },
      memo: "first lumber drop",
      recordedAt: "2026-05-04T10:05:00Z",
    })
    .run();
}

async function insertPatch(db: Db) {
  const createdAt = "2026-04-18T12:00:00Z" as IsoDate;
  const edits: CommitmentEdit[] = [
    { op: "void", commitmentId: ids.commitmentId, reason: "replaced in CO #1" },
  ];
  const patchId = await patchIdFor({ jobId: ids.jobId, edits, createdAt });
  db.insert(patches)
    .values({
      id: patchId,
      jobId: ids.jobId,
      author: ids.clientId,
      message: "void framing",
      createdAt,
      edits,
    })
    .run();
  return patchId;
}

function assertCommitmentRoundTrip(db: Db) {
  const commitmentRow = db
    .select()
    .from(commitments)
    .where(sql`${commitments.id} = ${ids.commitmentId}`)
    .get();
  expect(commitmentRow?.price).toEqual({ kind: "lump", total: usd(700_000) });
}

function assertActivationRoundTrip(db: Db) {
  const activationRow = db
    .select()
    .from(activations)
    .where(sql`${activations.id} = ${ids.activationId}`)
    .get();
  expect(activationRow?.throughput).toEqual({
    units: 20,
    per: "day",
    unit: "lf",
  });
}

function assertScopeRoundTrip(db: Db) {
  const scopeRow = db
    .select()
    .from(scopes)
    .where(sql`${scopes.id} = ${ids.childScopeId}`)
    .get();
  expect(scopeRow?.spec).toEqual({
    materials: [{ description: "2x4 studs", quantity: 40, unit: "ea" }],
  });
}

function assertCostRoundTrip(db: Db) {
  const costRow = db
    .select()
    .from(costs)
    .where(sql`${costs.id} = ${ids.costId}`)
    .get();
  expect(costRow?.source).toMatchObject({
    kind: "invoice",
    invoiceNumber: "LY-7791",
  });
}

function assertPatchRoundTrip(db: Db, patchId: schema.PatchId) {
  const patchRow = db
    .select()
    .from(patches)
    .where(sql`${patches.id} = ${patchId}`)
    .get();
  expect(patchRow?.edits).toHaveLength(1);
  expect(patchRow?.edits[0]).toMatchObject({
    op: "void",
    reason: "replaced in CO #1",
  });
}

function assertDocumentAndNtpRoundTrip(db: Db) {
  const docRow = db
    .select()
    .from(documents)
    .where(sql`${documents.id} = ${docId}`)
    .get();
  expect(docRow?.tags).toEqual(["invoice"]);

  const ntpRow = db
    .select()
    .from(ntpEvents)
    .where(sql`${ntpEvents.id} = ${ids.ntpId}`)
    .get();
  expect(ntpRow?.issuedOn).toBe("2026-04-27");
}

describe("schema FK graph", () => {
  it("every FK callback resolves to a real column", () => {
    // getTableConfig walks each table's FK list and invokes the lazy
    // `.references(() => other.id)` arrow, which is how drizzle-kit would
    // resolve them during migration generation.
    for (const [name, table] of Object.entries(schema.tables)) {
      const cfg = getTableConfig(table);
      for (const fk of cfg.foreignKeys) {
        const ref = fk.reference();
        expect(ref.columns.length).toBeGreaterThan(0);
        expect(ref.foreignColumns.length).toBe(ref.columns.length);
        for (const col of ref.foreignColumns) {
          expect(col.name).toBeTruthy();
        }
      }
      expect(cfg.name).toBe(
        // Snake-case the camelCase export name for commitmentScopes / ntpEvents.
        name
          .replace(/([A-Z])/g, "_$1")
          .toLowerCase()
          .replace(/^_/, ""),
      );
    }
  });
});

describe("full schema round-trip (better-sqlite3)", () => {
  it("inserts + selects through every table with FKs intact", async () => {
    const db = fresh();

    insertProjectAndParties(db);
    insertJobAndActivity(db);
    insertScopes(db);
    insertCommitmentAndActivation(db);
    insertNtpAndDocument(db);
    insertCost(db);
    const patchId = await insertPatch(db);

    // Reads prove JSON round-trips and FK chains.
    assertCommitmentRoundTrip(db);
    assertActivationRoundTrip(db);
    assertScopeRoundTrip(db);
    assertCostRoundTrip(db);
    assertPatchRoundTrip(db, patchId);
    assertDocumentAndNtpRoundTrip(db);
  });

  it("rejects a missing FK target at the database level", () => {
    const db = fresh();
    db.insert(projects)
      .values({ id: "proj_x" as schema.ProjectId, name: "x", slug: "x" })
      .run();
    db.insert(jobs)
      .values({
        id: "job_a" as schema.JobId,
        projectId: "proj_x" as schema.ProjectId,
        name: "A",
        slug: "a",
      })
      .run();
    db.insert(scopes)
      .values({
        id: "scope_a_root" as schema.ScopeId,
        jobId: "job_a" as schema.JobId,
        name: "root",
        spec: { materials: [] },
      })
      .run();

    expect(() =>
      db
        .insert(scopes)
        .values({
          id: "scope_child" as schema.ScopeId,
          jobId: "job_a" as schema.JobId,
          parentId: "scope_ghost" as schema.ScopeId,
          name: "child",
          spec: { materials: [] },
        })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
