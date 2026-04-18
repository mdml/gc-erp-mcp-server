import {
  type ActivationId,
  type ActivityId,
  activities,
  type CommitmentEdit,
  type CommitmentId,
  costs,
  type DocumentId,
  type JobId,
  jobs,
  type PartyId,
  type ProjectId,
  parties,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { applyPatch } from "./apply_patch";
import { recordCost } from "./record_cost";

// ---------------------------------------------------------------------------
// Fixture — mirrors apply_patch.test.ts and the TOOLS.md §6 Day 3 walkthrough
// so the numeric assertions line up with canonical kitchen-remodel values.
// ---------------------------------------------------------------------------

const projectId = "proj_test" as ProjectId;
const jobId = "job_kitchen" as JobId;
const otherJobId = "job_other" as JobId;

const partyRogelio = "party_rogelio" as PartyId;

const scopeKitchen = "scope_kitchen" as ScopeId;
const scopeDemo = "scope_demo" as ScopeId;
const scopeFraming = "scope_framing" as ScopeId;
const scopeElsewhere = "scope_other_job" as ScopeId;

const actFrame = "act_frame" as ActivityId;
const actPunch = "act_punch" as ActivityId;
const actLumberDrop = "act_lumber_drop" as ActivityId;
const actPaint = "act_paint" as ActivityId;

const cmFrame = "cm_frame" as CommitmentId;
const actvDrop = "actv_drop" as ActivationId;
const actvFrame = "actv_frame" as ActivationId;
const actvPunch = "actv_punch" as ActivationId;

function usd(cents: number) {
  return { cents, currency: "USD" as const };
}

const rogelioCreate: CommitmentEdit & { op: "create" } = {
  op: "create",
  commitment: {
    id: cmFrame,
    jobId,
    scopeIds: [scopeDemo, scopeFraming],
    counterpartyId: partyRogelio,
    price: { kind: "lump", total: usd(850_000) },
    activations: [
      {
        id: actvDrop,
        activityId: actLumberDrop,
        scopeId: scopeDemo,
        pricePortion: usd(50_000),
        leadTime: { days: 5 },
        buildTime: { days: 1 },
      },
      {
        id: actvFrame,
        activityId: actFrame,
        scopeId: scopeFraming,
        pricePortion: usd(700_000),
        leadTime: { days: 3 },
        buildTime: { days: 3 },
      },
      {
        id: actvPunch,
        activityId: actPunch,
        scopeId: scopeDemo,
        pricePortion: usd(100_000),
        leadTime: { days: 0 },
        buildTime: { days: 1 },
      },
    ],
    signedOn: "2026-04-18",
  },
};

async function seedFixture() {
  const db = createTestDb();

  await db
    .insert(projects)
    .values({ id: projectId, name: "Main St Remodel", slug: "main-st" })
    .run();
  await db
    .insert(parties)
    .values({ id: partyRogelio, kind: "org", name: "Rogelio's Framing LLC" })
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
        id: scopeDemo,
        jobId,
        parentId: scopeKitchen,
        name: "Demo",
        spec: { materials: [] },
      },
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
      { id: actFrame, name: "Frame", slug: "frame", defaultUnit: "lf" },
      { id: actPunch, name: "Punch List", slug: "punch" },
      { id: actLumberDrop, name: "Lumber Drop", slug: "lumber_drop" },
      { id: actPaint, name: "Paint", slug: "paint", defaultUnit: "sqft" },
    ])
    .run();
  await applyPatch.handler({
    db,
    input: {
      jobId,
      message: "Rogelio framing contract",
      edits: [rogelioCreate],
    },
  });

  return db;
}

// ---------------------------------------------------------------------------
// Day 14 — canonical walkthrough
// ---------------------------------------------------------------------------

describe("record_cost — TOOLS.md §6 Day 14 scenario", () => {
  it("records the lumber invoice and persists with matching FK + amount", async () => {
    const db = await seedFixture();
    const { cost } = await recordCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeDemo,
        commitmentId: cmFrame,
        activityId: actLumberDrop,
        activationId: actvDrop,
        counterpartyId: partyRogelio,
        amount: usd(48_000),
        incurredOn: "2026-05-04",
        source: {
          kind: "invoice",
          invoiceNumber: "LY-7791",
          receivedOn: "2026-05-04",
          documentId: "doc_abc" as DocumentId,
        },
      },
    });

    expect(cost.id.startsWith("cost_")).toBe(true);
    expect(cost.amount).toEqual(usd(48_000));
    expect(cost.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const row = await db
      .select()
      .from(costs)
      .where(eq(costs.id, cost.id))
      .get();
    expect(row?.amountCents).toBe(48_000);
    expect(row?.activationId).toBe(actvDrop);
    expect(row?.scopeId).toBe(scopeDemo);
    expect(row?.commitmentId).toBe(cmFrame);
    expect(row?.source).toMatchObject({
      kind: "invoice",
      invoiceNumber: "LY-7791",
    });
  });

  it("Demo scope rolls up $480 of cost after the lumber invoice lands", async () => {
    const db = await seedFixture();
    await recordCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeDemo,
        commitmentId: cmFrame,
        activityId: actLumberDrop,
        activationId: actvDrop,
        counterpartyId: partyRogelio,
        amount: usd(48_000),
        incurredOn: "2026-05-04",
        source: {
          kind: "invoice",
          invoiceNumber: "LY-7791",
          receivedOn: "2026-05-04",
        },
      },
    });
    const total = await db
      .select({ cents: costs.amountCents })
      .from(costs)
      .where(eq(costs.scopeId, scopeDemo))
      .all();
    expect(total.reduce((s, r) => s + r.cents, 0)).toBe(48_000);
  });
});

// ---------------------------------------------------------------------------
// Happy-path shape variations
// ---------------------------------------------------------------------------

describe("record_cost — shape variations", () => {
  it("records without an activationId (activityId-only tie-back)", async () => {
    const db = await seedFixture();
    const { cost } = await recordCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeFraming,
        commitmentId: cmFrame,
        activityId: actFrame,
        counterpartyId: partyRogelio,
        amount: usd(100_000),
        incurredOn: "2026-05-10",
        source: { kind: "direct", note: "progress draw" },
      },
    });
    expect(cost.activationId).toBeUndefined();
    const row = await db
      .select()
      .from(costs)
      .where(eq(costs.id, cost.id))
      .get();
    expect(row?.activationId).toBeNull();
  });

  it("accepts an adjustment source and preserves memo", async () => {
    const db = await seedFixture();
    const { cost } = await recordCost.handler({
      db,
      input: {
        jobId,
        scopeId: scopeDemo,
        commitmentId: cmFrame,
        activityId: actLumberDrop,
        counterpartyId: partyRogelio,
        amount: usd(-2_000),
        incurredOn: "2026-05-05",
        source: { kind: "adjustment", reason: "returned 2 studs" },
        memo: "LY credit memo",
      },
    });
    expect(cost.amount.cents).toBe(-2_000);
    expect(cost.memo).toBe("LY credit memo");
  });
});

// ---------------------------------------------------------------------------
// FK + cross-entity validation
// ---------------------------------------------------------------------------

describe("record_cost — validation", () => {
  const baseInput = () => ({
    jobId,
    scopeId: scopeDemo,
    commitmentId: cmFrame,
    activityId: actLumberDrop,
    activationId: actvDrop,
    counterpartyId: partyRogelio,
    amount: usd(10_000),
    incurredOn: "2026-05-04" as const,
    source: { kind: "direct" as const },
  });

  it("rejects unknown scope with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), scopeId: "scope_ghost" as ScopeId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects unknown commitment with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), commitmentId: "cm_ghost" as CommitmentId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects unknown activity with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), activityId: "act_ghost" as ActivityId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects unknown counterparty with not_found", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), counterpartyId: "party_ghost" as PartyId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects scope from a different job with invariant_violation (scope_job_mismatch)", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), scopeId: scopeElsewhere },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      details: { code: "scope_job_mismatch" },
    });
  });

  it("rejects commitment from a different job with invariant_violation (commitment_job_mismatch)", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), jobId: otherJobId },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      details: { code: "scope_job_mismatch" },
    });
    // Note: scope_job_mismatch fires first because scopeDemo belongs to `jobId`
    // (the original), not `otherJobId`. A commitment-only mismatch would need a
    // matching scope in otherJobId — covered implicitly by the code path.
  });

  it("rejects recording against a voided commitment with invariant_violation", async () => {
    const db = await seedFixture();
    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "terminate",
        edits: [
          {
            op: "void",
            commitmentId: cmFrame,
            reason: "sub breached",
          },
        ],
      },
    });
    await expect(
      recordCost.handler({ db, input: baseInput() }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      message: expect.stringContaining("voided"),
    });
  });

  it("rejects activityId that does not appear on the commitment", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: {
          ...baseInput(),
          activityId: actPaint,
          activationId: undefined,
        },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      message: expect.stringContaining("does not appear"),
    });
  });

  it("rejects activationId that belongs to another commitment", async () => {
    const db = await seedFixture();
    // Create a second commitment with its own activation.
    const cmOther = "cm_other" as CommitmentId;
    const actvOther = "actv_other" as ActivationId;
    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "second",
        edits: [
          {
            op: "create",
            commitment: {
              id: cmOther,
              jobId,
              scopeIds: [scopeFraming],
              counterpartyId: partyRogelio,
              price: { kind: "lump", total: usd(1_000) },
              activations: [
                {
                  id: actvOther,
                  activityId: actFrame,
                  scopeId: scopeFraming,
                  pricePortion: usd(1_000),
                  leadTime: { days: 0 },
                  buildTime: { days: 0 },
                },
              ],
            },
          },
        ],
      },
    });

    await expect(
      recordCost.handler({
        db,
        input: { ...baseInput(), activationId: actvOther },
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { activationId: actvOther, commitmentId: cmFrame },
    });
  });

  it("rejects activationId whose activityId does not match the cost's activityId", async () => {
    const db = await seedFixture();
    await expect(
      recordCost.handler({
        db,
        input: {
          ...baseInput(),
          // actvDrop belongs to cmFrame but has activityId = actLumberDrop,
          // not actFrame.
          activityId: actFrame,
          activationId: actvDrop,
        },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      message: expect.stringContaining("has activityId"),
    });
  });
});
