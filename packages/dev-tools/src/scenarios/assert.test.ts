import { describe, expect, it } from "vitest";
import {
  assertEqual,
  assertHasKey,
  assertTrue,
  ScenarioAssertionError,
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
