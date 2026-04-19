import { describe, expect, it } from "vitest";
import type { IsoDate } from "../schema/common";
import type {
  ActivationId,
  ActivityId,
  CommitmentId,
  JobId,
  PartyId,
  PatchId,
  ScopeId,
} from "../schema/ids";
import type { Patch } from "../schema/patches";
import { applyEditToFold, foldPatches } from "./fold";

const jobId = "job_k" as JobId;
const partyId = "party_rog" as PartyId;
const scopeFraming = "scope_framing" as ScopeId;
const scopeDemo = "scope_demo" as ScopeId;
const actFrame = "act_frame" as ActivityId;
const actDrop = "act_drop" as ActivityId;
const cFrame = "cm_frame" as CommitmentId;
const aDrop = "actv_drop" as ActivationId;
const aFrame = "actv_frame" as ActivationId;
const aPantry = "actv_pantry" as ActivationId;
const at = (s: string): IsoDate => s as IsoDate;

const createFramePatch: Patch = {
  id: "pat_1" as PatchId,
  jobId,
  message: "create framing",
  createdAt: at("2026-04-18T12:00:00Z"),
  edits: [
    {
      op: "create",
      commitment: {
        id: cFrame,
        jobId,
        scopeIds: [scopeDemo, scopeFraming],
        counterpartyId: partyId,
        price: { kind: "lump", total: { cents: 750_000, currency: "USD" } },
        activations: [
          {
            id: aDrop,
            activityId: actDrop,
            scopeId: scopeDemo,
            pricePortion: { cents: 50_000, currency: "USD" },
            leadTime: { days: 5 },
            buildTime: { days: 1 },
          },
          {
            id: aFrame,
            activityId: actFrame,
            scopeId: scopeFraming,
            pricePortion: { cents: 700_000, currency: "USD" },
            leadTime: { days: 3 },
            buildTime: { days: 3 },
          },
        ],
      },
    },
  ],
};

const changeOrderPatch: Patch = {
  id: "pat_2" as PatchId,
  parentPatchId: "pat_1" as PatchId,
  jobId,
  message: "CO #1: add pantry",
  createdAt: at("2026-06-17T15:00:00Z"),
  edits: [
    {
      op: "addActivation",
      commitmentId: cFrame,
      activation: {
        id: aPantry,
        activityId: actFrame,
        scopeId: scopeFraming,
        pricePortion: { cents: 90_000, currency: "USD" },
        leadTime: { days: 2 },
        buildTime: { days: 1 },
      },
    },
    {
      op: "setPrice",
      commitmentId: cFrame,
      price: { kind: "lump", total: { cents: 840_000, currency: "USD" } },
    },
  ],
};

describe("foldPatches", () => {
  it("returns an empty map for an empty patch chain", () => {
    expect(foldPatches([]).size).toBe(0);
  });

  it("folds a single create patch into one commitment entry", () => {
    const fold = foldPatches([createFramePatch]);
    expect(fold.size).toBe(1);
    const entry = fold.get(cFrame);
    expect(entry).toBeDefined();
    expect(entry?.commitment.activations).toHaveLength(2);
    expect(entry?.voidedAt).toBeUndefined();
  });

  it("applies a change-order patch atomically: addActivation + setPrice", () => {
    const fold = foldPatches([createFramePatch, changeOrderPatch]);
    const entry = fold.get(cFrame);
    expect(entry).toBeDefined();
    expect(entry?.commitment.activations).toHaveLength(3);
    expect(entry?.commitment.activations[2]?.id).toBe(aPantry);
    expect(
      entry?.commitment.price.kind === "lump"
        ? entry.commitment.price.total.cents
        : -1,
    ).toBe(840_000);
  });

  it("silently skips edits targeting unknown commitments (projection, not validator)", () => {
    const orphan: Patch = {
      ...changeOrderPatch,
      id: "pat_orphan" as PatchId,
      edits: [
        {
          op: "setPrice",
          commitmentId: "cm_ghost" as CommitmentId,
          price: { kind: "lump", total: { cents: 1, currency: "USD" } },
        },
      ],
    };
    const fold = foldPatches([orphan]);
    expect(fold.size).toBe(0);
  });

  it("projects void state via voidedAt / voidedReason without removing the entry", () => {
    const voidPatch: Patch = {
      id: "pat_v" as PatchId,
      parentPatchId: "pat_1" as PatchId,
      jobId,
      message: "void framing",
      createdAt: at("2026-07-01T00:00:00Z"),
      edits: [
        { op: "void", commitmentId: cFrame, reason: "sub walked off job" },
      ],
    };
    const fold = foldPatches([createFramePatch, voidPatch]);
    const entry = fold.get(cFrame);
    expect(entry?.voidedAt).toBe("2026-07-01T00:00:00Z");
    expect(entry?.voidedReason).toBe("sub walked off job");
  });
});

describe("applyEditToFold (per-op)", () => {
  it("setActivation merges partial fields onto the existing activation", () => {
    const fold = foldPatches([createFramePatch]);
    applyEditToFold(
      fold,
      {
        op: "setActivation",
        commitmentId: cFrame,
        activationId: aFrame,
        fields: { leadTime: { days: 10 } },
      },
      at("2026-05-01T00:00:00Z"),
    );
    const entry = fold.get(cFrame);
    const frameAct = entry?.commitment.activations.find((a) => a.id === aFrame);
    expect(frameAct?.leadTime.days).toBe(10);
    expect(frameAct?.buildTime.days).toBe(3); // untouched
  });

  it("removeActivation filters the named activation", () => {
    const fold = foldPatches([createFramePatch]);
    applyEditToFold(
      fold,
      {
        op: "removeActivation",
        commitmentId: cFrame,
        activationId: aDrop,
      },
      at("2026-05-01T00:00:00Z"),
    );
    const entry = fold.get(cFrame);
    expect(entry?.commitment.activations.map((a) => a.id)).toEqual([aFrame]);
  });
});
