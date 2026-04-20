import {
  type ActivityId,
  activations,
  activities,
  commitmentScopes,
  commitments,
  costs,
  type JobId,
  jobs,
  type PartyId,
  type ProjectId,
  parties,
  patches,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "./_test-db";
import { recordDirectCost } from "./record_direct_cost";

// ---------------------------------------------------------------------------
// Fixture — minimal shape to exercise the Day-18 path (no pre-existing
// commitment to attach the cost to; the tool creates its own self-commitment).
// ---------------------------------------------------------------------------

const projectId = "proj_test" as ProjectId;
const jobId = "job_kitchen" as JobId;
const otherJobId = "job_other" as JobId;

const partyMax = "party_max" as PartyId;

const scopeKitchen = "scope_kitchen" as ScopeId;
const scopeFraming = "scope_framing" as ScopeId;
const scopeElsewhere = "scope_other_job" as ScopeId;

const actMaterialsDirect = "act_materials_direct" as ActivityId;
const actLaborTm = "act_labor_tm" as ActivityId;

function usd(cents: number) {
  return { cents, currency: "USD" as const };
}

async function seedFixture() {
  const db = createTestDb();

  await db
    .insert(projects)
    .values({ id: projectId, name: "Main St Remodel", slug: "main-st" })
    .run();
  await db
    .insert(parties)
    .values({ id: partyMax, kind: "person", name: "Max" })
    .run();
  await db
    .insert(jobs)
    .values([
      { id: jobId, projectId, name: "Kitchen", slug: "kitchen" },
      { id: otherJobId, projectId, name: "Bath", slug: "bath" },
    ])
    .run();
  await db
    .insert(scopes)
    .values([
      { id: scopeKitchen, jobId, name: "Kitchen", spec: { materials: [] } },
      {
        id: scopeFraming,
        jobId,
        parentId: scopeKitchen,
        name: "Framing",
        spec: { materials: [] },
      },
      {
        id: scopeElsewhere,
        jobId: otherJobId,
        name: "Bath demo",
        spec: { materials: [] },
      },
    ])
    .run();
  await db
    .insert(activities)
    .values([
      {
        id: actMaterialsDirect,
        name: "Materials (Direct)",
        slug: "materials_direct",
      },
      {
        id: actLaborTm,
        name: "Labor (T&M)",
        slug: "labor_tm",
        defaultUnit: "hr",
      },
    ])
    .run();

  return db;
}

// ---------------------------------------------------------------------------
// Day 18 — the canonical walkthrough
// ---------------------------------------------------------------------------

describe("record_direct_cost — TOOLS.md §6 Day 18 scenario", () => {
  it("creates a self-commitment + cost atomically", async () => {
    const db = await seedFixture();
    const { cost, commitment, patchId } = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actMaterialsDirect,
        counterpartyId: partyMax,
        amount: usd(12_000),
        incurredOn: "2026-05-01",
        source: { kind: "direct", note: "bracing hardware, lumberyard" },
      },
    });

    // Shape: lump-priced, single activation, zero lead/build,
    // scopeIds = [scopeFraming], signedOn = incurredOn.
    expect(commitment.id.startsWith("cm_")).toBe(true);
    expect(commitment.jobId).toBe(jobId);
    expect(commitment.scopeIds).toEqual([scopeFraming]);
    expect(commitment.counterpartyId).toBe(partyMax);
    expect(commitment.price).toEqual({ kind: "lump", total: usd(12_000) });
    expect(commitment.activations).toHaveLength(1);
    expect(commitment.activations[0]).toMatchObject({
      activityId: actMaterialsDirect,
      scopeId: scopeFraming,
      pricePortion: usd(12_000),
      leadTime: { days: 0 },
      buildTime: { days: 0 },
    });
    expect(commitment.signedOn).toBe("2026-05-01");

    // Cost references the new commitment + its activation.
    expect(cost.commitmentId).toBe(commitment.id);
    expect(cost.activationId).toBe(commitment.activations[0].id);
    expect(cost.amount).toEqual(usd(12_000));

    expect(patchId.startsWith("pat_")).toBe(true);

    // Projection: all five rows landed.
    const commRow = await db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .get();
    expect(commRow?.voidedAt).toBeNull();

    const actRows = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, commitment.id))
      .all();
    expect(actRows).toHaveLength(1);
    expect(actRows[0].leadTimeDays).toBe(0);
    expect(actRows[0].buildTimeDays).toBe(0);

    const junctionRows = await db
      .select()
      .from(commitmentScopes)
      .where(eq(commitmentScopes.commitmentId, commitment.id))
      .all();
    expect(junctionRows).toHaveLength(1);
    expect(junctionRows[0].scopeId).toBe(scopeFraming);

    const patchRow = await db
      .select()
      .from(patches)
      .where(eq(patches.id, patchId))
      .get();
    expect(patchRow?.jobId).toBe(jobId);
    expect(patchRow?.parentPatchId).toBeNull();

    const costRow = await db
      .select()
      .from(costs)
      .where(eq(costs.id, cost.id))
      .get();
    expect(costRow?.amountCents).toBe(12_000);
    expect(costRow?.commitmentId).toBe(commitment.id);
  });

  it("accepts a labor_tm activity and preserves the source hours", async () => {
    const db = await seedFixture();
    const { cost, commitment } = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actLaborTm,
        counterpartyId: partyMax,
        amount: usd(30_000),
        incurredOn: "2026-05-02",
        source: { kind: "tm", hours: 4 },
        memo: "day rate",
      },
    });
    expect(commitment.activations[0].activityId).toBe(actLaborTm);
    expect(cost.source).toMatchObject({ kind: "tm", hours: 4 });
    expect(cost.memo).toBe("day rate");
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("record_direct_cost — validation", () => {
  const baseInput = () => ({
    jobId,
    scopeId: scopeFraming,
    activityId: actMaterialsDirect,
    counterpartyId: partyMax,
    amount: usd(1_000),
    incurredOn: "2026-05-01" as const,
    source: { kind: "direct" as const },
  });

  it("rejects a scope belonging to a different job (invariant_violation)", async () => {
    const db = await seedFixture();
    await expect(
      recordDirectCost.handler({
        db,
        input: { ...baseInput(), scopeId: scopeElsewhere },
      }),
    ).rejects.toMatchObject({ code: "invariant_violation" });
  });

  it("rejects an unknown activity with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordDirectCost.handler({
        db,
        input: { ...baseInput(), activityId: "act_ghost" as ActivityId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects an unknown counterparty with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordDirectCost.handler({
        db,
        input: { ...baseInput(), counterpartyId: "party_ghost" as PartyId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects an unknown scope with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordDirectCost.handler({
        db,
        input: { ...baseInput(), scopeId: "scope_ghost" as ScopeId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// Atomicity — the whole reason this tool exists rather than being sugar over
// apply_patch + record_cost. If the cost insert fails, the commitment must
// not persist (TOOLS.md L68, ADR 0008).
// ---------------------------------------------------------------------------

describe("record_direct_cost — atomicity (ADR 0008 batch rollback)", () => {
  it("rolls back patch + commitment + activation + junction if the cost insert fails mid-batch", async () => {
    const db = await seedFixture();

    // Intercept .batch(...) to keep all but the last statement (the cost
    // insert) and replace it with a pre-rejected Promise. Simulates a
    // batch-time FK / unique-constraint failure on `costs` — exactly the
    // failure mode the atomicity guarantee exists to protect against.
    type Batchable = { batch: (qs: readonly unknown[]) => Promise<unknown[]> };
    const dbAny = db as unknown as Batchable;
    const realBatch = dbAny.batch.bind(dbAny);
    const spy = vi.spyOn(dbAny, "batch").mockImplementation((stmts) => {
      const injected = [
        ...stmts.slice(0, -1),
        Promise.reject(new Error("simulated batch-time failure on costs")),
      ];
      return realBatch(injected);
    });

    const before = {
      patches: (await db.select().from(patches).all()).length,
      commitments: (await db.select().from(commitments).all()).length,
      activations: (await db.select().from(activations).all()).length,
      junctions: (await db.select().from(commitmentScopes).all()).length,
      costs: (await db.select().from(costs).all()).length,
    };

    await expect(
      recordDirectCost.handler({
        db,
        input: {
          jobId,
          scopeId: scopeFraming,
          activityId: actMaterialsDirect,
          counterpartyId: partyMax,
          amount: usd(12_000),
          incurredOn: "2026-05-01",
          source: { kind: "direct", note: "bracing hardware" },
        },
      }),
    ).rejects.toBeDefined();

    spy.mockRestore();

    const after = {
      patches: (await db.select().from(patches).all()).length,
      commitments: (await db.select().from(commitments).all()).length,
      activations: (await db.select().from(activations).all()).length,
      junctions: (await db.select().from(commitmentScopes).all()).length,
      costs: (await db.select().from(costs).all()).length,
    };

    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Post-fold invariants — the auto-generated self-commitment satisfies every
// invariant apply_patch's fold enforces (ADR 0005 inclusion, price match).
// Covered implicitly by the happy-path test; pinned here so the guarantee is
// a named contract.
// ---------------------------------------------------------------------------

describe("record_direct_cost — post-fold invariants", () => {
  it("assertActivationScopesInCommitment holds: activation.scopeId ∈ commitment.scopeIds", async () => {
    const db = await seedFixture();
    const { commitment } = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actMaterialsDirect,
        counterpartyId: partyMax,
        amount: usd(5_000),
        incurredOn: "2026-05-01",
        source: { kind: "direct" },
      },
    });
    expect(commitment.scopeIds).toContain(commitment.activations[0].scopeId);
  });

  it("assertCommitmentPriceMatchesActivations holds: price.total == sum(pricePortion)", async () => {
    const db = await seedFixture();
    const { commitment } = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actMaterialsDirect,
        counterpartyId: partyMax,
        amount: usd(7_500),
        incurredOn: "2026-05-01",
        source: { kind: "direct" },
      },
    });
    const activationTotal = commitment.activations.reduce(
      (s, a) => s + a.pricePortion.cents,
      0,
    );
    expect(commitment.price).toMatchObject({ kind: "lump" });
    if (commitment.price.kind === "lump") {
      expect(commitment.price.total.cents).toBe(activationTotal);
    }
  });
});

// ---------------------------------------------------------------------------
// A second call on the same scope produces a distinct self-commitment — the
// tool is not idempotent, which matches the SPEC §2 Day 18 intent (each
// card-swipe is a separate cost event).
// ---------------------------------------------------------------------------

describe("record_direct_cost — independence across calls", () => {
  it("two successive direct costs produce two distinct self-commitments", async () => {
    const db = await seedFixture();
    const first = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actMaterialsDirect,
        counterpartyId: partyMax,
        amount: usd(1_000),
        incurredOn: "2026-05-01",
        source: { kind: "direct" },
      },
    });
    const second = await recordDirectCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        activityId: actMaterialsDirect,
        counterpartyId: partyMax,
        amount: usd(2_000),
        incurredOn: "2026-05-02",
        source: { kind: "direct" },
      },
    });
    expect(first.commitment.id).not.toBe(second.commitment.id);
    expect(first.patchId).not.toBe(second.patchId);
    expect(first.cost.id).not.toBe(second.cost.id);

    const commRows = await db
      .select({ id: commitments.id })
      .from(commitments)
      .all();
    expect(commRows.map((r) => r.id).sort()).toEqual(
      [first.commitment.id, second.commitment.id].sort(),
    );
  });
});
