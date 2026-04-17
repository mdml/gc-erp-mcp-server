import { describe, expect, it } from "vitest";
import { Activation, Commitment, PriceKind, Throughput } from "./commitments";

const usd = (cents: number) => ({ cents, currency: "USD" as const });

describe("PriceKind Zod", () => {
  it("round-trips a lump price", () => {
    const v = { kind: "lump" as const, total: usd(850_000) };
    expect(PriceKind.parse(v)).toEqual(v);
  });

  it("round-trips a unit price", () => {
    const v = {
      kind: "unit" as const,
      perUnit: usd(7_500),
      unit: "sqft",
      estimatedUnits: 42,
    };
    expect(PriceKind.parse(v)).toEqual(v);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      PriceKind.parse({ kind: "cost-plus" as "lump", total: usd(100) }),
    ).toThrow();
  });
});

describe("Throughput Zod", () => {
  it("requires positive units", () => {
    expect(() =>
      Throughput.parse({ units: 0, per: "day", unit: "lf" }),
    ).toThrow();
  });

  it("accepts a standard pacing spec", () => {
    const v = { units: 20, per: "day" as const, unit: "lf" };
    expect(Throughput.parse(v)).toEqual(v);
  });
});

describe("Activation Zod", () => {
  it("round-trips minimal and full activations", () => {
    const minimal = {
      id: "actv_a",
      activityId: "act_frame",
      scopeId: "scope_framing",
      pricePortion: usd(700_000),
      leadTime: { days: 3 },
      buildTime: { days: 3 },
    };
    expect(Activation.parse(minimal)).toEqual(minimal);

    const full = {
      ...minimal,
      throughput: { units: 20, per: "day" as const, unit: "lf" },
    };
    expect(Activation.parse(full)).toEqual(full);
  });

  it("requires scopeId (ADR 0005)", () => {
    const noScope: Record<string, unknown> = {
      id: "actv_a",
      activityId: "act_frame",
      pricePortion: usd(700_000),
      leadTime: { days: 3 },
      buildTime: { days: 3 },
    };
    expect(() => Activation.parse(noScope)).toThrow();
  });
});

describe("Commitment Zod", () => {
  const lump = {
    id: "cm_frame",
    jobId: "job_kitchen",
    scopeIds: ["scope_demo", "scope_framing"],
    counterpartyId: "party_rogelio",
    price: { kind: "lump" as const, total: usd(850_000) },
    activations: [
      {
        id: "actv_drop",
        activityId: "act_lumberDrop",
        scopeId: "scope_demo",
        pricePortion: usd(50_000),
        leadTime: { days: 5 },
        buildTime: { days: 1 },
      },
      {
        id: "actv_frame",
        activityId: "act_frame",
        scopeId: "scope_framing",
        pricePortion: usd(700_000),
        leadTime: { days: 3 },
        buildTime: { days: 3 },
      },
      {
        id: "actv_punch",
        activityId: "act_punch",
        scopeId: "scope_demo",
        pricePortion: usd(100_000),
        leadTime: { days: 0 },
        buildTime: { days: 1 },
      },
    ],
    signedOn: "2026-04-18",
  };

  it("round-trips a lump-priced, multi-scope commitment", () => {
    expect(Commitment.parse(lump)).toEqual(lump);
    expect(Commitment.parse(Commitment.parse(lump))).toEqual(lump);
  });

  it("requires at least one scope and one activation", () => {
    expect(() => Commitment.parse({ ...lump, scopeIds: [] })).toThrow();
    expect(() => Commitment.parse({ ...lump, activations: [] })).toThrow();
  });

  it("rejects a malformed signedOn", () => {
    expect(() =>
      Commitment.parse({ ...lump, signedOn: "yesterday" }),
    ).toThrow();
  });
});
