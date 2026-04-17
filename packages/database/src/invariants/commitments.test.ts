import { describe, expect, it } from "vitest";
import type { Commitment } from "../schema/commitments";
import type {
  ActivationId,
  ActivityId,
  CommitmentId,
  JobId,
  PartyId,
  ScopeId,
} from "../schema/ids";
import {
  assertCommitmentPriceMatchesActivations,
  CommitmentInvariantError,
} from "./commitments";

const usd = (cents: number) => ({ cents, currency: "USD" as const });

const baseLump: Commitment = {
  id: "cm_1" as CommitmentId,
  jobId: "job_1" as JobId,
  scopeIds: ["scope_1" as ScopeId],
  counterpartyId: "party_1" as PartyId,
  price: { kind: "lump", total: usd(850_000) },
  activations: [
    {
      id: "actv_a" as ActivationId,
      activityId: "act_a" as ActivityId,
      pricePortion: usd(50_000),
      leadTime: { days: 5 },
      buildTime: { days: 1 },
    },
    {
      id: "actv_b" as ActivationId,
      activityId: "act_b" as ActivityId,
      pricePortion: usd(700_000),
      leadTime: { days: 3 },
      buildTime: { days: 3 },
    },
    {
      id: "actv_c" as ActivationId,
      activityId: "act_c" as ActivityId,
      pricePortion: usd(100_000),
      leadTime: { days: 0 },
      buildTime: { days: 1 },
    },
  ],
};

describe("assertCommitmentPriceMatchesActivations", () => {
  it("accepts a lump price whose activations sum to the total", () => {
    expect(() =>
      assertCommitmentPriceMatchesActivations(baseLump),
    ).not.toThrow();
  });

  it("rejects a lump where activations don't sum", () => {
    const bad: Commitment = {
      ...baseLump,
      price: { kind: "lump", total: usd(1_000_000) },
    };
    try {
      assertCommitmentPriceMatchesActivations(bad);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CommitmentInvariantError);
      const err = e as CommitmentInvariantError;
      expect(err.code).toBe("price_total_mismatch");
      expect(err.expectedCents).toBe(1_000_000);
      expect(err.actualCents).toBe(850_000);
    }
  });

  it("accepts a unit price whose activations sum to perUnit * estimatedUnits", () => {
    const c: Commitment = {
      ...baseLump,
      id: "cm_unit" as CommitmentId,
      price: {
        kind: "unit",
        perUnit: usd(7_500),
        unit: "sqft",
        estimatedUnits: 114, // 7_500 * 114 = 855_000 = 50_000 + 700_000 + 105_000
      },
      activations: [
        { ...baseLump.activations[0] },
        { ...baseLump.activations[1] },
        {
          ...baseLump.activations[2],
          pricePortion: usd(105_000),
        },
      ],
    };
    expect(() => assertCommitmentPriceMatchesActivations(c)).not.toThrow();
  });

  it("rejects a unit price mismatch", () => {
    const c: Commitment = {
      ...baseLump,
      price: {
        kind: "unit",
        perUnit: usd(7_500),
        unit: "sqft",
        estimatedUnits: 100, // 7_500 * 100 = 750_000 ≠ 850_000
      },
    };
    expect(() => assertCommitmentPriceMatchesActivations(c)).toThrow(
      CommitmentInvariantError,
    );
  });
});
