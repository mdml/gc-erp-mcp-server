import {
  type ActivationId,
  type ActivityId,
  activations,
  activities,
  type CommitmentEdit,
  type CommitmentId,
  commitmentScopes,
  commitments,
  type JobId,
  jobs,
  type NTPEventId,
  ntpEvents,
  type PartyId,
  type PatchId,
  type ProjectId,
  parties,
  patches,
  patchIdFor,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import { applyPatch } from "./apply_patch";

// ---------------------------------------------------------------------------
// Fixture — a small kitchen job with two scopes, two activities, one party.
// Mirrors TOOLS.md §6 Day 3 shape so the numeric assertions line up with
// the canonical walkthrough.
// ---------------------------------------------------------------------------

const projectId = "proj_test" as ProjectId;
const jobId = "job_kitchen" as JobId;
const otherJobId = "job_other" as JobId;
const partyRogelio = "party_rogelio" as PartyId;

const scopeKitchen = "scope_kitchen" as ScopeId;
const scopeDemo = "scope_demo" as ScopeId;
const scopeFraming = "scope_framing" as ScopeId;
const scopeElsewhere = "scope_other_job" as ScopeId; // belongs to otherJobId

const actFrame = "act_frame" as ActivityId;
const actPunch = "act_punch" as ActivityId;
const actLumberDrop = "act_lumber_drop" as ActivityId;

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
    ])
    .run();

  return db;
}

const rogelioCommitment = (id: string): CommitmentEdit & { op: "create" } => ({
  op: "create",
  commitment: {
    id: id as CommitmentId,
    jobId,
    scopeIds: [scopeDemo, scopeFraming],
    counterpartyId: partyRogelio,
    price: { kind: "lump", total: usd(850_000) },
    activations: [
      {
        id: "actv_drop" as ActivationId,
        activityId: actLumberDrop,
        scopeId: scopeDemo,
        pricePortion: usd(50_000),
        leadTime: { days: 5 },
        buildTime: { days: 1 },
      },
      {
        id: "actv_frame" as ActivationId,
        activityId: actFrame,
        scopeId: scopeFraming,
        pricePortion: usd(700_000),
        leadTime: { days: 3 },
        buildTime: { days: 3 },
      },
      {
        id: "actv_punch" as ActivationId,
        activityId: actPunch,
        scopeId: scopeDemo,
        pricePortion: usd(100_000),
        leadTime: { days: 0 },
        buildTime: { days: 1 },
      },
    ],
    signedOn: "2026-04-18",
  },
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("apply_patch — create", () => {
  it("creates a commitment with all projection rows", async () => {
    const db = await seedFixture();
    const { patch } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "Rogelio framing contract",
        edits: [rogelioCommitment("cm_frame")],
      },
    });
    expect(patch.id.startsWith("pat_")).toBe(true);
    expect(patch.parentPatchId).toBeUndefined();

    const commRow = await db
      .select()
      .from(commitments)
      .where(eq(commitments.id, "cm_frame" as CommitmentId))
      .get();
    expect(commRow?.price).toEqual({ kind: "lump", total: usd(850_000) });
    expect(commRow?.voidedAt).toBeNull();

    const actRows = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_frame" as CommitmentId))
      .all();
    expect(actRows).toHaveLength(3);
    expect(
      actRows.map((a) => a.pricePortionCents).sort((x, y) => x - y),
    ).toEqual([50_000, 100_000, 700_000]);

    const junctionRows = await db
      .select()
      .from(commitmentScopes)
      .where(eq(commitmentScopes.commitmentId, "cm_frame" as CommitmentId))
      .all();
    expect(junctionRows.map((r) => r.scopeId).sort()).toEqual(
      [scopeDemo, scopeFraming].sort(),
    );

    const patchRow = await db
      .select()
      .from(patches)
      .where(eq(patches.id, patch.id))
      .get();
    expect(patchRow?.edits).toHaveLength(1);
  });

  it("rejects create with cross-job scopeId", async () => {
    const db = await seedFixture();
    const badEdit = rogelioCommitment("cm_bad");
    badEdit.commitment.scopeIds = [scopeDemo, scopeElsewhere];
    await expect(
      applyPatch.handler({
        db,
        input: { jobId, message: "bad", edits: [badEdit] },
      }),
    ).rejects.toMatchObject({
      name: "McpToolError",
      code: "invariant_violation",
    });

    const row = await db
      .select()
      .from(commitments)
      .where(eq(commitments.id, "cm_bad" as CommitmentId))
      .get();
    expect(row).toBeUndefined();
  });

  it("rejects create when activation.scopeId is outside commitment.scopeIds (post-fold)", async () => {
    const db = await seedFixture();
    const badEdit = rogelioCommitment("cm_mismatch");
    // scopeKitchen belongs to the job but is not in the commitment.scopeIds
    // list — so the post-fold scope-inclusion invariant trips, not the
    // cross-job scope gate.
    badEdit.commitment.scopeIds = [scopeDemo, scopeFraming];
    badEdit.commitment.activations[0] = {
      ...badEdit.commitment.activations[0],
      scopeId: scopeKitchen,
    };
    await expect(
      applyPatch.handler({
        db,
        input: { jobId, message: "bad", edits: [badEdit] },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      details: expect.objectContaining({
        code: "activation_scope_not_in_commitment",
      }),
    });
  });

  it("rejects create with price mismatching activation sum (post-fold)", async () => {
    const db = await seedFixture();
    const badEdit = rogelioCommitment("cm_price_bad");
    badEdit.commitment.price = { kind: "lump", total: usd(900_000) };
    await expect(
      applyPatch.handler({
        db,
        input: { jobId, message: "bad", edits: [badEdit] },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      details: expect.objectContaining({ code: "price_total_mismatch" }),
    });
  });
});

// ---------------------------------------------------------------------------
// setPrice
// ---------------------------------------------------------------------------

describe("apply_patch — setPrice", () => {
  it("changes the price in a follow-up patch", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_p")],
      },
    });

    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "CO #1: true-up price and resize punch",
        edits: [
          {
            op: "setPrice",
            commitmentId: "cm_p" as CommitmentId,
            price: { kind: "lump", total: usd(900_000) },
          },
          {
            op: "setActivation",
            commitmentId: "cm_p" as CommitmentId,
            activationId: "actv_punch" as ActivationId,
            fields: { pricePortion: usd(150_000) },
          },
        ],
      },
    });

    const row = await db
      .select()
      .from(commitments)
      .where(eq(commitments.id, "cm_p" as CommitmentId))
      .get();
    expect(row?.price).toEqual({ kind: "lump", total: usd(900_000) });

    const punchRow = await db
      .select()
      .from(activations)
      .where(eq(activations.id, "actv_punch" as ActivationId))
      .get();
    expect(punchRow?.pricePortionCents).toBe(150_000);
  });
});

// ---------------------------------------------------------------------------
// addActivation
// ---------------------------------------------------------------------------

describe("apply_patch — addActivation", () => {
  it("adds an activation and tops the price to match", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_add")],
      },
    });

    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "CO #1: add pantry framing",
        edits: [
          {
            op: "addActivation",
            commitmentId: "cm_add" as CommitmentId,
            activation: {
              id: "actv_pantry" as ActivationId,
              activityId: actFrame,
              scopeId: scopeFraming,
              pricePortion: usd(90_000),
              leadTime: { days: 2 },
              buildTime: { days: 1 },
            },
          },
          {
            op: "setPrice",
            commitmentId: "cm_add" as CommitmentId,
            price: { kind: "lump", total: usd(940_000) },
          },
        ],
      },
    });

    const allActivations = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_add" as CommitmentId))
      .all();
    expect(allActivations).toHaveLength(4);
    expect(
      allActivations.reduce((sum, a) => sum + a.pricePortionCents, 0),
    ).toBe(940_000);
  });
});

// ---------------------------------------------------------------------------
// setActivation
// ---------------------------------------------------------------------------

describe("apply_patch — setActivation", () => {
  it("updates lead/build time on an activation", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_sa")],
      },
    });
    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "slip schedule",
        edits: [
          {
            op: "setActivation",
            commitmentId: "cm_sa" as CommitmentId,
            activationId: "actv_frame" as ActivationId,
            fields: { leadTime: { days: 7 }, buildTime: { days: 4 } },
          },
        ],
      },
    });
    const row = await db
      .select()
      .from(activations)
      .where(eq(activations.id, "actv_frame" as ActivationId))
      .get();
    expect(row?.leadTimeDays).toBe(7);
    expect(row?.buildTimeDays).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// removeActivation
// ---------------------------------------------------------------------------

describe("apply_patch — removeActivation", () => {
  it("removes an activation and reconciles price", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_rem")],
      },
    });

    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "drop punch",
        edits: [
          {
            op: "removeActivation",
            commitmentId: "cm_rem" as CommitmentId,
            activationId: "actv_punch" as ActivationId,
          },
          {
            op: "setPrice",
            commitmentId: "cm_rem" as CommitmentId,
            price: { kind: "lump", total: usd(750_000) },
          },
        ],
      },
    });

    const rows = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_rem" as CommitmentId))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual(
      ["actv_drop", "actv_frame"].sort(),
    );
  });

  it("rejects removeActivation when an NTP event references the activation (F1.3)", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_ntp")],
      },
    });
    await db
      .insert(ntpEvents)
      .values({
        id: "ntp_1" as NTPEventId,
        activationId: "actv_drop" as ActivationId,
        issuedOn: "2026-04-27",
      })
      .run();

    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          parentPatchId: first.id,
          message: "cannot drop NTP'd activation",
          edits: [
            {
              op: "removeActivation",
              commitmentId: "cm_ntp" as CommitmentId,
              activationId: "actv_drop" as ActivationId,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      details: { activationId: "actv_drop" },
    });

    // Projection untouched.
    const rows = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_ntp" as CommitmentId))
      .all();
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// void
// ---------------------------------------------------------------------------

describe("apply_patch — void", () => {
  it("sets voided_at + voided_reason and excludes via projection filter (ADR 0009)", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_v")],
      },
    });
    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "void rogelio",
        edits: [
          {
            op: "void",
            commitmentId: "cm_v" as CommitmentId,
            reason: "terminated mid-stream",
          },
        ],
      },
    });
    const row = await db
      .select()
      .from(commitments)
      .where(eq(commitments.id, "cm_v" as CommitmentId))
      .get();
    expect(row?.voidedAt).toBeTruthy();
    expect(row?.voidedReason).toBe("terminated mid-stream");
  });

  it("rejects a second edit after void (ADR 0006 — voided is final)", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_v2")],
      },
    });
    await applyPatch.handler({
      db,
      input: {
        jobId,
        parentPatchId: first.id,
        message: "void",
        edits: [
          {
            op: "void",
            commitmentId: "cm_v2" as CommitmentId,
            reason: "terminated",
          },
        ],
      },
    });
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          message: "re-price a dead commitment",
          edits: [
            {
              op: "setPrice",
              commitmentId: "cm_v2" as CommitmentId,
              price: { kind: "lump", total: usd(1) },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "invariant_violation" });
  });
});

// ---------------------------------------------------------------------------
// Day 3 scenario — exact TOOLS.md §6 numbers
// ---------------------------------------------------------------------------

describe("apply_patch — TOOLS.md §6 Day 3 scenario", () => {
  it("creates Rogelio's commitment and yields the scenario's per-scope sums", async () => {
    const db = await seedFixture();
    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "Rogelio framing contract",
        edits: [rogelioCommitment("cm_rogelio")],
      },
    });

    // Demo.committed = $500 drop + $1,000 punch = $1,500
    const demoTotal = await db
      .select({ cents: activations.pricePortionCents })
      .from(activations)
      .where(eq(activations.scopeId, scopeDemo))
      .all();
    expect(demoTotal.reduce((s, r) => s + r.cents, 0)).toBe(150_000);

    // Framing.committed = $7,000
    const framingTotal = await db
      .select({ cents: activations.pricePortionCents })
      .from(activations)
      .where(eq(activations.scopeId, scopeFraming))
      .all();
    expect(framingTotal.reduce((s, r) => s + r.cents, 0)).toBe(700_000);
  });
});

// ---------------------------------------------------------------------------
// Content-addressed id stability
// ---------------------------------------------------------------------------

describe("apply_patch — content-addressed id", () => {
  it("the persisted patch id equals patchIdFor({jobId, parentPatchId, edits, createdAt})", async () => {
    const db = await seedFixture();
    const { patch } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "deterministic",
        edits: [rogelioCommitment("cm_det")],
      },
    });
    const recomputed = await patchIdFor({
      jobId: patch.jobId,
      edits: patch.edits,
      createdAt: patch.createdAt,
    });
    expect(patch.id).toBe(recomputed);
  });
});

// ---------------------------------------------------------------------------
// Parent-patch validation
// ---------------------------------------------------------------------------

describe("apply_patch — parent patch", () => {
  it("rejects an unknown parentPatchId", async () => {
    const db = await seedFixture();
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          parentPatchId: "pat_ghost" as PatchId,
          message: "orphan",
          edits: [rogelioCommitment("cm_orphan")],
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a parentPatchId from a different job", async () => {
    const db = await seedFixture();
    // Create a patch against otherJobId first.
    const strayCommitment = rogelioCommitment("cm_stray");
    strayCommitment.commitment.jobId = otherJobId;
    strayCommitment.commitment.scopeIds = [scopeElsewhere];
    strayCommitment.commitment.activations =
      strayCommitment.commitment.activations.map((a) => ({
        ...a,
        scopeId: scopeElsewhere,
      }));
    const { patch: strayPatch } = await applyPatch.handler({
      db,
      input: {
        jobId: otherJobId,
        message: "stray",
        edits: [strayCommitment],
      },
    });
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          parentPatchId: strayPatch.id,
          message: "cross-job parent",
          edits: [rogelioCommitment("cm_cross")],
        },
      }),
    ).rejects.toMatchObject({ code: "invariant_violation" });
  });
});

// ---------------------------------------------------------------------------
// Batch rollback
// ---------------------------------------------------------------------------

describe("apply_patch — batch rollback", () => {
  it("rolls back on FK violation inside the batched statements", async () => {
    const db = await seedFixture();
    // First, create a commitment so we have something the patches log
    // can point at.
    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_batch")],
      },
    });

    // Construct an input that clears handler-layer validation (the
    // commitment exists, isn't voided, scope is in the job, invariants
    // hold post-fold) but will fail the batch at D1 FK time: a
    // setActivation pointing at an activation id whose row exists but
    // targets a scope that the commitment doesn't carry. Handler gates
    // use the in-memory Commitment shape; to actually force a batch-time
    // failure we point setActivation at a pre-existing activationId that
    // happens to not belong to this commitment — FK on `activations.id`
    // is the primary key, so an UPDATE against it affects zero rows
    // (no error) and doesn't demonstrate rollback. Instead:
    //
    // Reach into the projection directly to simulate a concurrent writer
    // that removed the actv_punch row between the handler's read and its
    // batch: this forces the batch's subsequent UPDATE to succeed
    // (UPDATE ... WHERE id = x matches 0 rows) but the POST-batch
    // consistency can't be asserted — which is the wrong shape for this
    // test. Instead, force the error by crafting an edit whose projection
    // SQL violates an existing UNIQUE constraint: adding an activation
    // whose id already exists on a different commitment.
    await db
      .insert(commitments)
      .values({
        id: "cm_parked" as CommitmentId,
        jobId,
        counterpartyId: partyRogelio,
        price: { kind: "lump", total: usd(1_000) },
      })
      .run();
    await db
      .insert(activations)
      .values({
        id: "actv_conflict" as ActivationId,
        commitmentId: "cm_parked" as CommitmentId,
        activityId: actFrame,
        scopeId: scopeFraming,
        pricePortionCents: 1_000,
        leadTimeDays: 0,
        buildTimeDays: 0,
      })
      .run();

    const beforeCount = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_batch" as CommitmentId))
      .all();
    const patchCountBefore = (await db.select().from(patches).all()).length;

    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          message: "would collide on primary key at batch time",
          edits: [
            // This edit passes the handler-layer checks — the activation
            // id is not present in the in-memory fold state of cm_batch —
            // but the projection INSERT will fail on the activations
            // primary key because the row is owned by cm_parked.
            {
              op: "addActivation",
              commitmentId: "cm_batch" as CommitmentId,
              activation: {
                id: "actv_conflict" as ActivationId,
                activityId: actFrame,
                scopeId: scopeFraming,
                pricePortion: usd(0),
                leadTime: { days: 0 },
                buildTime: { days: 0 },
              },
            },
          ],
        },
      }),
    ).rejects.toBeDefined();

    // Projection — cm_batch activations untouched.
    const afterCount = await db
      .select()
      .from(activations)
      .where(eq(activations.commitmentId, "cm_batch" as CommitmentId))
      .all();
    expect(afterCount.length).toBe(beforeCount.length);
    // And the patch row never landed.
    const patchCountAfter = (await db.select().from(patches).all()).length;
    expect(patchCountAfter).toBe(patchCountBefore);
  });
});

// ---------------------------------------------------------------------------
// Cross-edit guards
// ---------------------------------------------------------------------------

describe("apply_patch — cross-edit guards", () => {
  it("rejects duplicate create ids in the same patch", async () => {
    const db = await seedFixture();
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          message: "dupes",
          edits: [rogelioCommitment("cm_dupe"), rogelioCommitment("cm_dupe")],
        },
      }),
    ).rejects.toBeInstanceOf(McpToolError);
  });

  it("emits 'not_found' when a setPrice target commitment is missing", async () => {
    const db = await seedFixture();
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          message: "missing",
          edits: [
            {
              op: "setPrice",
              commitmentId: "cm_ghost" as CommitmentId,
              price: { kind: "lump", total: usd(1) },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("leaves activation with 0 entries rejected as invariant_violation", async () => {
    const db = await seedFixture();
    const { patch: first } = await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "initial",
        edits: [rogelioCommitment("cm_empty")],
      },
    });
    await expect(
      applyPatch.handler({
        db,
        input: {
          jobId,
          parentPatchId: first.id,
          message: "remove all",
          edits: [
            {
              op: "removeActivation",
              commitmentId: "cm_empty" as CommitmentId,
              activationId: "actv_drop" as ActivationId,
            },
            {
              op: "removeActivation",
              commitmentId: "cm_empty" as CommitmentId,
              activationId: "actv_frame" as ActivationId,
            },
            {
              op: "removeActivation",
              commitmentId: "cm_empty" as CommitmentId,
              activationId: "actv_punch" as ActivationId,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "invariant_violation" });
  });
});
