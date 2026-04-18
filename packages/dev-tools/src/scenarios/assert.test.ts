import type {
  ActivationId,
  ActivityId,
  CommitmentId,
  IsoDate,
  JobId,
  PartyId,
  Patch,
  PatchId,
  ScopeId,
} from "@gc-erp/database/schema";
import { describe, expect, it } from "vitest";
import {
  assertEqual,
  assertHasKey,
  assertPatchesRollupParity,
  assertTrue,
  ScenarioAssertionError,
  type ScopeTreeNodeForParity,
} from "./assert";

describe("assertEqual", () => {
  it("passes when JSON-serialized values match", () => {
    expect(() =>
      assertEqual({ a: 1, b: 2 }, { a: 1, b: 2 }, "match"),
    ).not.toThrow();
  });

  it("throws ScenarioAssertionError with a readable diff on mismatch", () => {
    const err = (() => {
      try {
        assertEqual({ a: 1 }, { a: 2 }, "mismatch");
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ScenarioAssertionError);
    expect((err as Error).message).toContain("mismatch");
    expect((err as Error).message).toContain('{"a":1}');
    expect((err as Error).message).toContain('{"a":2}');
  });

  it("treats different key orderings as different (by design — JSON.stringify order)", () => {
    // Documented: we rely on JSON.stringify ordering. If scenarios need
    // order-insensitive comparison, they should normalize before calling.
    expect(() => assertEqual({ a: 1, b: 2 }, { b: 2, a: 1 }, "order")).toThrow(
      ScenarioAssertionError,
    );
  });
});

describe("assertTrue", () => {
  it("passes when condition is true", () => {
    expect(() => assertTrue(true, "ok")).not.toThrow();
  });

  it("throws when condition is false", () => {
    expect(() => assertTrue(false, "no")).toThrow(ScenarioAssertionError);
  });
});

describe("assertHasKey", () => {
  it("narrows an unknown object when the key is present", () => {
    const v: unknown = { id: "proj_x" };
    assertHasKey(v, "id", "need id");
    // Post-narrowing, this compiles without an assertion.
    expect(v.id).toBe("proj_x");
  });

  it("throws on null, non-object, or missing key", () => {
    expect(() => assertHasKey(null, "id", "null")).toThrow(
      ScenarioAssertionError,
    );
    expect(() => assertHasKey("str", "id", "str")).toThrow(
      ScenarioAssertionError,
    );
    expect(() => assertHasKey({ other: 1 }, "id", "missing")).toThrow(
      ScenarioAssertionError,
    );
  });
});

describe("assertPatchesRollupParity", () => {
  const jobId = "job_k" as JobId;
  const partyId = "party_rog" as PartyId;
  const sDemo = "scope_demo" as ScopeId;
  const sFraming = "scope_framing" as ScopeId;
  const actFrame = "act_frame" as ActivityId;
  const cFrame = "cm_frame" as CommitmentId;
  const aDrop = "actv_drop" as ActivationId;
  const aFrame = "actv_frame" as ActivationId;

  const createPatch: Patch = {
    id: "pat_1" as PatchId,
    jobId,
    message: "create framing",
    createdAt: "2026-04-18T12:00:00Z" as IsoDate,
    edits: [
      {
        op: "create",
        commitment: {
          id: cFrame,
          jobId,
          scopeIds: [sDemo, sFraming],
          counterpartyId: partyId,
          price: { kind: "lump", total: { cents: 750_000, currency: "USD" } },
          activations: [
            {
              id: aDrop,
              activityId: actFrame,
              scopeId: sDemo,
              pricePortion: { cents: 50_000, currency: "USD" },
              leadTime: { days: 5 },
              buildTime: { days: 1 },
            },
            {
              id: aFrame,
              activityId: actFrame,
              scopeId: sFraming,
              pricePortion: { cents: 700_000, currency: "USD" },
              leadTime: { days: 3 },
              buildTime: { days: 3 },
            },
          ],
        },
      },
    ],
  };

  const tree = (
    kitchenCents: number,
    demoCents: number,
    framingCents: number,
  ): ScopeTreeNodeForParity[] => [
    {
      id: "scope_kitchen",
      name: "Kitchen",
      committed: { cents: kitchenCents },
      children: [
        {
          id: sDemo,
          name: "Demo",
          committed: { cents: demoCents },
          children: [],
        },
        {
          id: sFraming,
          name: "Framing",
          committed: { cents: framingCents },
          children: [],
        },
      ],
    },
  ];

  it("passes when fold rollup matches every tree node", () => {
    expect(() =>
      assertPatchesRollupParity(
        [createPatch],
        tree(750_000, 50_000, 700_000),
        "day 3",
      ),
    ).not.toThrow();
  });

  it("throws with the offending scope name on leaf mismatch", () => {
    expect(() =>
      assertPatchesRollupParity(
        [createPatch],
        tree(750_000, 50_000, 800_000),
        "mismatch",
      ),
    ).toThrow(/Framing.*parity mismatch/s);
  });

  it("throws when the root's rollup doesn't match the sum of children", () => {
    expect(() =>
      assertPatchesRollupParity(
        [createPatch],
        tree(1_000_000, 50_000, 700_000),
        "root",
      ),
    ).toThrow(/Kitchen.*parity mismatch/s);
  });

  it("excludes voided commitments (matches get_scope_tree's voided_at IS NULL)", () => {
    const voidPatch: Patch = {
      id: "pat_void" as PatchId,
      parentPatchId: "pat_1" as PatchId,
      jobId,
      message: "void framing",
      createdAt: "2026-07-01T00:00:00Z" as IsoDate,
      edits: [{ op: "void", commitmentId: cFrame, reason: "sub walked" }],
    };
    // After void, nothing is committed anywhere; tree should show 0s.
    expect(() =>
      assertPatchesRollupParity(
        [createPatch, voidPatch],
        tree(0, 0, 0),
        "post-void",
      ),
    ).not.toThrow();
  });
});
