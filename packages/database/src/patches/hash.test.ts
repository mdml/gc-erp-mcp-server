import { describe, expect, it } from "vitest";
import type { IsoDate } from "../schema/common";
import type { CommitmentId, JobId, PatchId } from "../schema/ids";
import type { CommitmentEdit } from "../schema/patches";
import { type PatchHashInput, patchIdFor } from "./hash";

const voidEdit: CommitmentEdit = {
  op: "void",
  commitmentId: "cm_1" as CommitmentId,
  reason: "dup",
};

const jobId = "job_k" as JobId;
const createdAt = "2026-04-18T12:00:00Z" as IsoDate;

// `hashWith` builds a `patchIdFor` input from a baseline (jobId, [voidEdit],
// createdAt) plus optional overrides — collapses the duplicated envelope
// shape across the "differs when X changes" tests.
const hashWith = (overrides: Partial<PatchHashInput> = {}) =>
  patchIdFor({ jobId, edits: [voidEdit], createdAt, ...overrides });

describe("patchIdFor", () => {
  it("returns a deterministic pat_<64 hex chars>", async () => {
    const id = await hashWith();
    expect(id).toMatch(/^pat_[0-9a-f]{64}$/);

    const again = await hashWith();
    expect(again).toBe(id);
  });

  it("differs when parentPatchId changes", async () => {
    const a = await hashWith();
    const b = await hashWith({ parentPatchId: "pat_parent" as PatchId });
    expect(a).not.toBe(b);
  });

  it("differs when edits change", async () => {
    const a = await hashWith();
    const b = await hashWith({ edits: [{ ...voidEdit, reason: "different" }] });
    expect(a).not.toBe(b);
  });

  it("differs when createdAt changes", async () => {
    const a = await hashWith();
    const b = await hashWith({ createdAt: "2026-04-18T12:00:01Z" as IsoDate });
    expect(a).not.toBe(b);
  });

  it("differs when jobId changes (F2.1)", async () => {
    const a = await hashWith();
    const b = await hashWith({ jobId: "job_other" as JobId });
    expect(a).not.toBe(b);
  });

  it("is order-stable across object key orderings", async () => {
    // Same edit, different key-insertion order in the literal.
    const e1: CommitmentEdit = {
      op: "setPrice",
      commitmentId: "cm_1" as CommitmentId,
      price: { kind: "lump", total: { cents: 100, currency: "USD" } },
    };
    // Build a semantically equal edit with a different key order.
    const e2: CommitmentEdit = JSON.parse(
      JSON.stringify({
        price: { total: { currency: "USD", cents: 100 }, kind: "lump" },
        commitmentId: "cm_1",
        op: "setPrice",
      }),
    );
    const a = await patchIdFor({ jobId, edits: [e1], createdAt });
    const b = await patchIdFor({ jobId, edits: [e2], createdAt });
    expect(a).toBe(b);
  });

  it("treats undefined and absent optional fields as equivalent (F2.5)", async () => {
    // A create edit whose commitment has `signedOn: undefined` should hash
    // the same as the same edit with `signedOn` absent entirely. Canonical
    // serialization drops undefined-valued keys before stringification —
    // this test locks that behavior against regression.
    const baseCommitment = {
      id: "cm_x",
      jobId,
      scopeIds: ["scope_1"],
      counterpartyId: "party_1",
      price: {
        kind: "lump",
        total: { cents: 100, currency: "USD" },
      },
      activations: [
        {
          id: "actv_1",
          activityId: "act_frame",
          scopeId: "scope_1",
          pricePortion: { cents: 100, currency: "USD" },
          leadTime: { days: 0 },
          buildTime: { days: 0 },
        },
      ],
    };
    const withUndef = {
      op: "create",
      commitment: { ...baseCommitment, signedOn: undefined },
    } as unknown as CommitmentEdit;
    const withAbsent = {
      op: "create",
      commitment: baseCommitment,
    } as unknown as CommitmentEdit;
    const a = await patchIdFor({
      jobId,
      edits: [withUndef],
      createdAt,
    });
    const b = await patchIdFor({
      jobId,
      edits: [withAbsent],
      createdAt,
    });
    expect(a).toBe(b);
  });
});
