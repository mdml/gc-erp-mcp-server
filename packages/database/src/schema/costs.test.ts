import { describe, expect, it } from "vitest";
import { Cost, CostSource } from "./costs";

const SHA = "a".repeat(64);
const usd = (cents: number) => ({ cents, currency: "USD" as const });

describe("CostSource Zod", () => {
  it("round-trips all four variants", () => {
    const invoice = {
      kind: "invoice" as const,
      invoiceNumber: "LY-7791",
      receivedOn: "2026-05-04",
      documentId: `doc_${SHA}`,
    };
    const direct = {
      kind: "direct" as const,
      note: "bracing hardware",
      documentId: `doc_${SHA}`,
    };
    const tm = { kind: "tm" as const, hours: 4, documentId: `doc_${SHA}` };
    const adj = { kind: "adjustment" as const, reason: "true-up to PO" };

    expect(CostSource.parse(invoice)).toEqual(invoice);
    expect(CostSource.parse(direct)).toEqual(direct);
    expect(CostSource.parse(tm)).toEqual(tm);
    expect(CostSource.parse(adj)).toEqual(adj);
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      CostSource.parse({
        kind: "refund" as "invoice",
        invoiceNumber: "x",
        receivedOn: "2026-01-01",
      }),
    ).toThrow();
  });
});

describe("Cost Zod", () => {
  const base = {
    id: "cost_1",
    jobId: "job_kitchen",
    scopeId: "scope_demo",
    commitmentId: "cm_frame",
    activityId: "act_lumberDrop",
    counterpartyId: "party_rogelio",
    amount: usd(48_000),
    incurredOn: "2026-05-04",
    source: {
      kind: "invoice" as const,
      invoiceNumber: "LY-7791",
      receivedOn: "2026-05-04",
    },
    recordedAt: "2026-05-04T10:00:00Z",
  };

  it("round-trips a minimal cost", () => {
    expect(Cost.parse(base)).toEqual(base);
  });

  it("round-trips with optional activationId and memo", () => {
    const full = {
      ...base,
      activationId: "actv_drop",
      memo: "received; stacked by north pile",
    };
    expect(Cost.parse(full)).toEqual(full);
  });

  it("requires amount, scopeId, commitmentId, activityId", () => {
    expect(() => Cost.parse({ ...base, amount: undefined })).toThrow();
    expect(() => Cost.parse({ ...base, scopeId: undefined })).toThrow();
    expect(() => Cost.parse({ ...base, commitmentId: undefined })).toThrow();
    expect(() => Cost.parse({ ...base, activityId: undefined })).toThrow();
  });

  it("accepts negative amounts (adjustment credit)", () => {
    const credit = {
      ...base,
      amount: usd(-2_000),
      source: { kind: "adjustment" as const, reason: "overbilled by $20" },
    };
    expect(Cost.parse(credit)).toEqual(credit);
  });
});
