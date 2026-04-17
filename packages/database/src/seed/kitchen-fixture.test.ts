import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertCommitmentPriceMatchesActivations,
  assertCostReferencesSameJob,
  assertScopeTreeInvariants,
} from "../invariants";
import * as schema from "../schema";
import type { Commitment } from "../schema/commitments";
import {
  activations,
  commitmentScopes,
  commitments,
} from "../schema/commitments";
import type { Money } from "../schema/common";
import { costs } from "../schema/costs";
import { jobs } from "../schema/jobs";
import { ntpEvents } from "../schema/ntp-events";
import { parties } from "../schema/parties";
import { patches } from "../schema/patches";
import { projects } from "../schema/projects";
import { scopes } from "../schema/scopes";
import {
  FRAMING_ACTIVATIONS,
  FRAMING_COMMITMENT,
  KITCHEN_IDS,
  KITCHEN_PARTIES,
  KITCHEN_SCOPES,
  LUMBER_COST,
  SELF_HW_ACTIVATIONS,
  SELF_HW_COMMITMENT,
  SELF_HW_COST,
} from "./data/kitchen-fixture";
import { seedKitchenFixture } from "./kitchen-fixture";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function fresh(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/migrations" });
  return db;
}

function rowCount(db: Db, table: SQLiteTable): number {
  return db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0;
}

function assertRow<T>(row: T | undefined, label: string): asserts row is T {
  if (row === undefined) throw new Error(`expected row: ${label}`);
}

describe("seedKitchenFixture", () => {
  let db: Db;
  beforeEach(() => {
    db = fresh();
  });

  it("populates the Day-0-through-Day-18 walkthrough", async () => {
    await seedKitchenFixture(db);

    expect(rowCount(db, projects)).toBe(1);
    expect(rowCount(db, jobs)).toBe(1);
    expect(rowCount(db, parties)).toBe(KITCHEN_PARTIES.length);
    expect(rowCount(db, scopes)).toBe(KITCHEN_SCOPES.length);
    expect(rowCount(db, commitments)).toBe(2);
    expect(rowCount(db, activations)).toBe(
      FRAMING_ACTIVATIONS.length + SELF_HW_ACTIVATIONS.length,
    );
    // Framing spans [demo, framing] = 2; self-hw spans [framing] = 1.
    expect(rowCount(db, commitmentScopes)).toBe(3);
    expect(rowCount(db, ntpEvents)).toBe(1);
    expect(rowCount(db, costs)).toBe(2);
    expect(rowCount(db, patches)).toBe(2);
  });

  it("is idempotent — second run changes nothing", async () => {
    await seedKitchenFixture(db);
    const snapshot = {
      projects: rowCount(db, projects),
      jobs: rowCount(db, jobs),
      parties: rowCount(db, parties),
      scopes: rowCount(db, scopes),
      commitments: rowCount(db, commitments),
      activations: rowCount(db, activations),
      commitmentScopes: rowCount(db, commitmentScopes),
      ntpEvents: rowCount(db, ntpEvents),
      costs: rowCount(db, costs),
      patches: rowCount(db, patches),
    };

    await seedKitchenFixture(db);

    expect(rowCount(db, projects)).toBe(snapshot.projects);
    expect(rowCount(db, jobs)).toBe(snapshot.jobs);
    expect(rowCount(db, parties)).toBe(snapshot.parties);
    expect(rowCount(db, scopes)).toBe(snapshot.scopes);
    expect(rowCount(db, commitments)).toBe(snapshot.commitments);
    expect(rowCount(db, activations)).toBe(snapshot.activations);
    expect(rowCount(db, commitmentScopes)).toBe(snapshot.commitmentScopes);
    expect(rowCount(db, ntpEvents)).toBe(snapshot.ntpEvents);
    expect(rowCount(db, costs)).toBe(snapshot.costs);
    expect(rowCount(db, patches)).toBe(snapshot.patches);
  });

  it("satisfies SPEC §1 commitment price/activation-sum invariant", async () => {
    await seedKitchenFixture(db);

    for (const commitmentId of [FRAMING_COMMITMENT.id, SELF_HW_COMMITMENT.id]) {
      const commitmentRow = db
        .select()
        .from(commitments)
        .where(eq(commitments.id, commitmentId))
        .get();
      assertRow(commitmentRow, `commitment ${commitmentId}`);
      const activationRows = db
        .select()
        .from(activations)
        .where(eq(activations.commitmentId, commitmentId))
        .all();

      const commitment: Commitment = {
        id: commitmentRow.id,
        jobId: commitmentRow.jobId,
        counterpartyId: commitmentRow.counterpartyId,
        price: commitmentRow.price,
        signedOn: commitmentRow.signedOn ?? undefined,
        scopeIds: [KITCHEN_IDS.scopes.framing],
        activations: activationRows.map((a) => ({
          id: a.id,
          activityId: a.activityId,
          scopeId: a.scopeId,
          pricePortion: usd(a.pricePortionCents),
          leadTime: { days: a.leadTimeDays },
          buildTime: { days: a.buildTimeDays },
          ...(a.throughput ? { throughput: a.throughput } : {}),
        })),
      };

      expect(() =>
        assertCommitmentPriceMatchesActivations(commitment),
      ).not.toThrow();
    }
  });

  it("costs reference scope + commitment in the same job", async () => {
    await seedKitchenFixture(db);

    for (const costSeed of [LUMBER_COST, SELF_HW_COST]) {
      const costRow = db
        .select()
        .from(costs)
        .where(eq(costs.id, costSeed.id))
        .get();
      assertRow(costRow, `cost ${costSeed.id}`);
      const scopeRow = db
        .select()
        .from(scopes)
        .where(eq(scopes.id, costRow.scopeId))
        .get();
      assertRow(scopeRow, `scope ${costRow.scopeId}`);
      const commitmentRow = db
        .select()
        .from(commitments)
        .where(eq(commitments.id, costRow.commitmentId))
        .get();
      assertRow(commitmentRow, `commitment ${costRow.commitmentId}`);

      expect(() =>
        assertCostReferencesSameJob(
          {
            id: costRow.id,
            jobId: costRow.jobId,
            scopeId: costRow.scopeId,
            commitmentId: costRow.commitmentId,
            activityId: costRow.activityId,
            activationId: costRow.activationId ?? undefined,
            counterpartyId: costRow.counterpartyId,
            amount: usd(costRow.amountCents),
            incurredOn: costRow.incurredOn,
            source: costRow.source,
            memo: costRow.memo ?? undefined,
            recordedAt: costRow.recordedAt,
          },
          {
            scope: { id: scopeRow.id, jobId: scopeRow.jobId },
            commitment: { id: commitmentRow.id, jobId: commitmentRow.jobId },
          },
        ),
      ).not.toThrow();
    }
  });

  it("scope tree is acyclic with per-job parentage", async () => {
    await seedKitchenFixture(db);
    const siblings = db
      .select({ id: scopes.id, jobId: scopes.jobId, parentId: scopes.parentId })
      .from(scopes)
      .all()
      .map((s) => ({
        id: s.id,
        jobId: s.jobId,
        parentId: s.parentId ?? undefined,
      }));

    for (const s of siblings) {
      expect(() =>
        assertScopeTreeInvariants(
          s,
          siblings.filter((o) => o.id !== s.id),
        ),
      ).not.toThrow();
    }
  });

  it("patch chain: P2.parentPatchId resolves to P1", async () => {
    await seedKitchenFixture(db);
    const rows = db.select().from(patches).all();
    const withParent = rows.filter((p) => p.parentPatchId !== null);
    expect(withParent).toHaveLength(1);
    const parentId = withParent[0].parentPatchId;
    const parent = rows.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent?.parentPatchId).toBeNull();
  });
});

const usd = (cents: number): Money => ({ cents, currency: "USD" });
