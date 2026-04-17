import { describe, expect, it } from "vitest";
import { NTPEvent } from "./ntp-events";

describe("NTPEvent Zod", () => {
  const minimal = {
    id: "ntp_1",
    activationId: "actv_drop",
    issuedOn: "2026-04-27",
  };

  it("round-trips minimal and with a note", () => {
    expect(NTPEvent.parse(minimal)).toEqual(minimal);
    const withNote = { ...minimal, note: "site walked; OK to drop" };
    expect(NTPEvent.parse(withNote)).toEqual(withNote);
  });

  it("requires issuedOn in IsoDay format", () => {
    expect(() =>
      NTPEvent.parse({ ...minimal, issuedOn: "April 27, 2026" }),
    ).toThrow();
  });

  it("rejects a stray siteReady (ADR 0007: field dropped)", () => {
    // Zod strips unknown keys by default on objects, but the NTPEvent row
    // shape should never include this field — guard against a test fixture
    // accidentally re-introducing it by asserting the parsed output never
    // carries `siteReady`, regardless of input.
    const withStray = { ...minimal, siteReady: true };
    const parsed = NTPEvent.parse(withStray);
    expect("siteReady" in parsed).toBe(false);
  });
});
