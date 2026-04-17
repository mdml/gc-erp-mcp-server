import { describe, expect, it } from "vitest";
import { NTPEvent } from "./ntp-events";

describe("NTPEvent Zod", () => {
  const minimal = {
    id: "ntp_1",
    activationId: "actv_drop",
    issuedOn: "2026-04-27",
    siteReady: true,
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

  it("requires siteReady to be a boolean", () => {
    expect(() =>
      NTPEvent.parse({ ...minimal, siteReady: "yes" as unknown as boolean }),
    ).toThrow();
  });
});
