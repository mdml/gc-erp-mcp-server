import { describe, expect, it } from "vitest";
import { Party } from "./parties";

describe("Party Zod", () => {
  it("round-trips a person and an org", () => {
    const person = {
      id: "party_V1StGXR8_Z5jdHi6B-myT",
      kind: "person" as const,
      name: "Salman Ahmad",
      email: "salman@example.com",
    };
    expect(Party.parse(person)).toEqual(person);

    const org = {
      id: "party_ABCDEFGHIJKLMNOPQRSTU",
      kind: "org" as const,
      name: "Rogelio's Framing LLC",
    };
    expect(Party.parse(org)).toEqual(org);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      Party.parse({
        id: "party_x",
        kind: "contractor" as "person",
        name: "x",
      }),
    ).toThrow();
  });

  it("rejects a malformed email", () => {
    expect(() =>
      Party.parse({
        id: "party_x",
        kind: "person",
        name: "x",
        email: "not-an-email",
      }),
    ).toThrow();
  });
});
