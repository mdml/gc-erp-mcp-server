import { describe, expect, it } from "vitest";
import { Duration, IsoDate, IsoDay, Money } from "./common";

describe("Money", () => {
  it("accepts positive, zero, and negative integer cents in USD", () => {
    expect(Money.parse({ cents: 12_345, currency: "USD" })).toEqual({
      cents: 12_345,
      currency: "USD",
    });
    expect(Money.parse({ cents: 0, currency: "USD" })).toEqual({
      cents: 0,
      currency: "USD",
    });
    expect(Money.parse({ cents: -500, currency: "USD" })).toEqual({
      cents: -500,
      currency: "USD",
    });
  });

  it("rejects non-integer cents", () => {
    expect(() => Money.parse({ cents: 1.5, currency: "USD" })).toThrow();
  });

  it("rejects any currency other than USD (v1 lock)", () => {
    expect(() =>
      Money.parse({ cents: 100, currency: "EUR" as unknown as "USD" }),
    ).toThrow();
  });
});

describe("IsoDay", () => {
  it.each(["2026-04-17", "1999-12-31", "2000-01-01"])("accepts %s", (v) => {
    expect(IsoDay.parse(v)).toBe(v);
  });

  it.each([
    "2026-4-17",
    "2026/04/17",
    "04-17-2026",
    "2026-04-17T00:00:00Z",
    "",
  ])("rejects %s", (v) => {
    expect(() => IsoDay.parse(v)).toThrow();
  });
});

describe("IsoDate", () => {
  it("accepts ISO-8601 datetimes", () => {
    expect(IsoDate.parse("2026-04-17T12:34:56.789Z")).toBe(
      "2026-04-17T12:34:56.789Z",
    );
    expect(IsoDate.parse("2026-04-17T00:00:00Z")).toBe("2026-04-17T00:00:00Z");
  });

  it("rejects calendar-only strings", () => {
    expect(() => IsoDate.parse("2026-04-17")).toThrow();
  });
});

describe("Duration", () => {
  it("accepts non-negative integer days", () => {
    expect(Duration.parse({ days: 0 })).toEqual({ days: 0 });
    expect(Duration.parse({ days: 30 })).toEqual({ days: 30 });
  });

  it("rejects negative or non-integer days", () => {
    expect(() => Duration.parse({ days: -1 })).toThrow();
    expect(() => Duration.parse({ days: 1.5 })).toThrow();
  });
});
