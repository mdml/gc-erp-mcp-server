import { describe, expect, it } from "vitest";
import { CommitmentEdit, Patch } from "./patches";

const usd = (cents: number) => ({ cents, currency: "USD" as const });

describe("CommitmentEdit Zod", () => {
  it("round-trips each op variant", () => {
    const create = {
      op: "create" as const,
      commitment: {
        id: "cm_frame",
        jobId: "job_k",
        scopeIds: ["scope_demo"],
        counterpartyId: "party_r",
        price: { kind: "lump" as const, total: usd(100) },
        activations: [
          {
            id: "actv_1",
            activityId: "act_frame",
            scopeId: "scope_demo",
            pricePortion: usd(100),
            leadTime: { days: 0 },
            buildTime: { days: 1 },
          },
        ],
      },
    };
    const setPrice = {
      op: "setPrice" as const,
      commitmentId: "cm_frame",
      price: { kind: "lump" as const, total: usd(200) },
    };
    const addActivation = {
      op: "addActivation" as const,
      commitmentId: "cm_frame",
      activation: {
        id: "actv_2",
        activityId: "act_punch",
        scopeId: "scope_demo",
        pricePortion: usd(50),
        leadTime: { days: 0 },
        buildTime: { days: 1 },
      },
    };
    const setActivation = {
      op: "setActivation" as const,
      commitmentId: "cm_frame",
      activationId: "actv_1",
      fields: { pricePortion: usd(150) },
    };
    const removeActivation = {
      op: "removeActivation" as const,
      commitmentId: "cm_frame",
      activationId: "actv_2",
    };
    const voidOp = {
      op: "void" as const,
      commitmentId: "cm_frame",
      reason: "duplicate",
    };

    for (const v of [
      create,
      setPrice,
      addActivation,
      setActivation,
      removeActivation,
      voidOp,
    ]) {
      expect(CommitmentEdit.parse(v)).toEqual(v);
    }
  });

  it("setActivation.fields strips activityId (F1.1 tightening)", () => {
    // activityId is omitted from the setActivation field mask. Passing it
    // is allowed by Zod's default strip behavior, but the parsed output
    // drops it — operators who need to change the kind-of-work must
    // removeActivation + addActivation, which preserves audit clarity.
    const withActivityId = {
      op: "setActivation" as const,
      commitmentId: "cm_frame",
      activationId: "actv_1",
      fields: { activityId: "act_other", pricePortion: usd(150) },
    };
    const parsed = CommitmentEdit.parse(withActivityId);
    expect(parsed).toMatchObject({
      op: "setActivation",
      fields: { pricePortion: usd(150) },
    });
    // `fields.activityId` should not survive parsing.
    if (parsed.op === "setActivation") {
      expect("activityId" in parsed.fields).toBe(false);
    }
  });
});

describe("Patch Zod", () => {
  const base = {
    id: "pat_abc",
    jobId: "job_k",
    message: "Rogelio framing contract",
    createdAt: "2026-04-18T12:00:00Z",
    edits: [
      {
        op: "void" as const,
        commitmentId: "cm_frame",
        reason: "duplicate",
      },
    ],
  };

  it("round-trips with and without parentPatchId/author", () => {
    expect(Patch.parse(base)).toEqual(base);
    const withParent = {
      ...base,
      parentPatchId: "pat_parent",
      author: "party_me",
    };
    expect(Patch.parse(withParent)).toEqual(withParent);
  });

  it("requires at least one edit", () => {
    expect(() => Patch.parse({ ...base, edits: [] })).toThrow();
  });
});
