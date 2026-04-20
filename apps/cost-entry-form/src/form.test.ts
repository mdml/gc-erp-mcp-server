import { describe, expect, it } from "vitest";
import {
  buildRecordCostArguments,
  canSave,
  DEFAULT_SOURCE,
  FormNotReadyError,
  type FormState,
  initialState,
  isValidAmountCents,
  isValidIsoDay,
  isValidSource,
  missingIds,
  type PrefillContext,
  resetSource,
  updateSourceField,
} from "./form";

const FULL_PREFILL: PrefillContext = {
  jobId: "job_1",
  jobName: "Kitchen Remodel",
  scopeId: "scope_1",
  scopeName: "Kitchen",
  commitmentId: "cm_1",
  commitmentLabel: "Demo + framing SOV",
  activityId: "act_1",
  activityName: "Framing",
  counterpartyId: "party_1",
  counterpartyName: "Acme Framing",
};

function valid(overrides: Partial<FormState> = {}): FormState {
  return {
    prefill: FULL_PREFILL,
    amountCents: 12500,
    incurredOn: "2026-04-20",
    memo: "",
    source: {
      kind: "invoice",
      invoiceNumber: "INV-001",
      receivedOn: "2026-04-20",
    },
    ...overrides,
  };
}

describe("initialState", () => {
  it("defaults editable fields from prefill when provided", () => {
    const s = initialState({ ...FULL_PREFILL, amountCents: 999, memo: "hi" });
    expect(s.amountCents).toBe(999);
    expect(s.memo).toBe("hi");
  });

  it("leaves editable fields unset when prefill omits them", () => {
    const s = initialState(FULL_PREFILL);
    expect(s.amountCents).toBeNull();
    expect(s.incurredOn).toBe("");
    expect(s.memo).toBe("");
    expect(s.source).toEqual(DEFAULT_SOURCE);
  });
});

describe("missingIds", () => {
  it("returns empty when every required id is present", () => {
    expect(missingIds(FULL_PREFILL)).toEqual([]);
  });

  it("lists missing required ids in declaration order", () => {
    expect(missingIds({ jobId: "job_1", activityId: "act_1" })).toEqual([
      "scopeId",
      "commitmentId",
      "counterpartyId",
    ]);
  });

  it("treats a missing jobId as missing", () => {
    expect(missingIds({})).toContain("jobId");
  });
});

describe("isValidIsoDay", () => {
  it("accepts an ISO day", () => {
    expect(isValidIsoDay("2026-04-20")).toBe(true);
  });

  it.each([
    "",
    "2026-4-20",
    "2026-04-32",
    "not-a-date",
    "2026-13-01",
  ])("rejects %s", (s) => {
    expect(isValidIsoDay(s)).toBe(false);
  });
});

describe("isValidAmountCents", () => {
  it.each([0, 1, 12345])("accepts %d", (n) => {
    expect(isValidAmountCents(n)).toBe(true);
  });

  it.each([null, -1, 1.5, Number.NaN])("rejects %s", (n) => {
    expect(isValidAmountCents(n as number | null)).toBe(false);
  });
});

describe("isValidSource", () => {
  it("accepts invoice with invoice number and receivedOn", () => {
    expect(
      isValidSource({
        kind: "invoice",
        invoiceNumber: "INV-1",
        receivedOn: "2026-04-20",
      }),
    ).toBe(true);
  });

  it("rejects invoice with blank invoice number", () => {
    expect(
      isValidSource({
        kind: "invoice",
        invoiceNumber: "   ",
        receivedOn: "2026-04-20",
      }),
    ).toBe(false);
  });

  it("rejects invoice with invalid receivedOn", () => {
    expect(
      isValidSource({
        kind: "invoice",
        invoiceNumber: "INV-1",
        receivedOn: "not-a-date",
      }),
    ).toBe(false);
  });

  it("accepts direct source regardless of optional note", () => {
    expect(isValidSource({ kind: "direct" })).toBe(true);
    expect(isValidSource({ kind: "direct", note: "note" })).toBe(true);
  });

  it("validates tm hours when provided", () => {
    expect(isValidSource({ kind: "tm" })).toBe(true);
    expect(isValidSource({ kind: "tm", hours: 4 })).toBe(true);
    expect(isValidSource({ kind: "tm", hours: -1 })).toBe(false);
    expect(isValidSource({ kind: "tm", hours: Number.NaN })).toBe(false);
  });

  it("requires a non-blank reason for adjustment", () => {
    expect(isValidSource({ kind: "adjustment", reason: "overbilled" })).toBe(
      true,
    );
    expect(isValidSource({ kind: "adjustment", reason: "  " })).toBe(false);
  });
});

describe("resetSource", () => {
  it("returns an empty invoice for invoice kind", () => {
    expect(resetSource("invoice")).toEqual({
      kind: "invoice",
      invoiceNumber: "",
      receivedOn: "",
    });
  });

  it("returns a bare direct source", () => {
    expect(resetSource("direct")).toEqual({ kind: "direct" });
  });

  it("returns a bare tm source", () => {
    expect(resetSource("tm")).toEqual({ kind: "tm" });
  });

  it("returns an empty-reason adjustment", () => {
    expect(resetSource("adjustment")).toEqual({
      kind: "adjustment",
      reason: "",
    });
  });
});

describe("updateSourceField", () => {
  it("updates invoice.invoiceNumber", () => {
    const s = resetSource("invoice");
    expect(updateSourceField(s, "invoiceNumber", "INV-42")).toEqual({
      kind: "invoice",
      invoiceNumber: "INV-42",
      receivedOn: "",
    });
  });

  it("updates invoice.receivedOn", () => {
    const s = resetSource("invoice");
    expect(updateSourceField(s, "receivedOn", "2026-04-20")).toEqual({
      kind: "invoice",
      invoiceNumber: "",
      receivedOn: "2026-04-20",
    });
  });

  it("sets direct.note to undefined when cleared", () => {
    const s = { kind: "direct", note: "prior" } as const;
    expect(updateSourceField(s, "directNote", "")).toEqual({ kind: "direct" });
  });

  it("clears tm.hours when the input is blank", () => {
    const s = { kind: "tm", hours: 4 } as const;
    expect(updateSourceField(s, "tmHours", "")).toEqual({ kind: "tm" });
  });

  it("parses tm.hours when set", () => {
    expect(updateSourceField(resetSource("tm"), "tmHours", "3.5")).toEqual({
      kind: "tm",
      hours: 3.5,
    });
  });

  it("updates adjustment.reason", () => {
    expect(
      updateSourceField(resetSource("adjustment"), "reason", "overbilled"),
    ).toEqual({ kind: "adjustment", reason: "overbilled" });
  });

  it("returns the source unchanged when the fieldId does not match the current kind", () => {
    const s = resetSource("invoice");
    expect(updateSourceField(s, "reason", "x")).toBe(s);
  });
});

describe("canSave", () => {
  it("is true for a fully-populated state", () => {
    expect(canSave(valid())).toBe(true);
  });

  it("is false when any required id is missing", () => {
    const s = valid({ prefill: { ...FULL_PREFILL, scopeId: undefined } });
    expect(canSave(s)).toBe(false);
  });

  it("is false when amountCents is null", () => {
    expect(canSave(valid({ amountCents: null }))).toBe(false);
  });

  it("is false when incurredOn is invalid", () => {
    expect(canSave(valid({ incurredOn: "" }))).toBe(false);
  });

  it("is false when source fails validation", () => {
    const s = valid({
      source: { kind: "invoice", invoiceNumber: "", receivedOn: "2026-04-20" },
    });
    expect(canSave(s)).toBe(false);
  });
});

describe("buildRecordCostArguments", () => {
  it("produces a payload matching RecordCostInput shape", () => {
    const args = buildRecordCostArguments(valid());
    expect(args).toEqual({
      jobId: "job_1",
      scopeId: "scope_1",
      commitmentId: "cm_1",
      activityId: "act_1",
      counterpartyId: "party_1",
      amount: { cents: 12500, currency: "USD" },
      incurredOn: "2026-04-20",
      source: {
        kind: "invoice",
        invoiceNumber: "INV-001",
        receivedOn: "2026-04-20",
      },
    });
  });

  it("includes activationId when the prefill provided one", () => {
    const s = valid({
      prefill: { ...FULL_PREFILL, activationId: "actv_1" },
    });
    expect(buildRecordCostArguments(s).activationId).toBe("actv_1");
  });

  it("omits memo when blank or whitespace-only", () => {
    expect(buildRecordCostArguments(valid({ memo: "" })).memo).toBeUndefined();
    expect(
      buildRecordCostArguments(valid({ memo: "   " })).memo,
    ).toBeUndefined();
  });

  it("includes memo when set", () => {
    expect(buildRecordCostArguments(valid({ memo: "partial" })).memo).toBe(
      "partial",
    );
  });

  it("throws FormNotReadyError when canSave is false", () => {
    expect(() =>
      buildRecordCostArguments(valid({ amountCents: null })),
    ).toThrow(FormNotReadyError);
  });
});
