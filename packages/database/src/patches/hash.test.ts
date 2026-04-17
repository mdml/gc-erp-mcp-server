import { describe, expect, it } from "vitest";
import type { IsoDate } from "../schema/common";
import type { CommitmentId, PatchId } from "../schema/ids";
import type { CommitmentEdit } from "../schema/patches";
import { patchIdFor } from "./hash";

const voidEdit: CommitmentEdit = {
  op: "void",
  commitmentId: "cm_1" as CommitmentId,
  reason: "dup",
};

describe("patchIdFor", () => {
  it("returns a deterministic pat_<64 hex chars>", async () => {
    const id = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    expect(id).toMatch(/^pat_[0-9a-f]{64}$/);

    const again = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    expect(again).toBe(id);
  });

  it("differs when parentPatchId changes", async () => {
    const a = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    const b = await patchIdFor({
      parentPatchId: "pat_parent" as PatchId,
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    expect(a).not.toBe(b);
  });

  it("differs when edits change", async () => {
    const a = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    const b = await patchIdFor({
      edits: [{ ...voidEdit, reason: "different" }],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    expect(a).not.toBe(b);
  });

  it("differs when createdAt changes", async () => {
    const a = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    const b = await patchIdFor({
      edits: [voidEdit],
      createdAt: "2026-04-18T12:00:01Z" as IsoDate,
    });
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
    const a = await patchIdFor({
      edits: [e1],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    const b = await patchIdFor({
      edits: [e2],
      createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    });
    expect(a).toBe(b);
  });
});
