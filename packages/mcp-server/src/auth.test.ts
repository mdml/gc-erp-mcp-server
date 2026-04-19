import { describe, expect, it } from "vitest";
import { stytchPublicBase, timingSafeEqual } from "./auth";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for strings of different lengths (short-circuits)", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("returns false for strings of equal length with different content", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("super-secret", "SUPER-SECRET")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("stytchPublicBase", () => {
  it("routes project-test-* to test.stytch.com", () => {
    expect(stytchPublicBase("project-test-abc")).toBe(
      "https://test.stytch.com/v1/public/project-test-abc",
    );
  });

  it("routes project-live-* to api.stytch.com", () => {
    expect(stytchPublicBase("project-live-xyz")).toBe(
      "https://api.stytch.com/v1/public/project-live-xyz",
    );
  });

  it("defaults to test.stytch.com for unknown prefixes (safer than guessing prod)", () => {
    expect(stytchPublicBase("project-sandbox-foo")).toBe(
      "https://test.stytch.com/v1/public/project-sandbox-foo",
    );
  });
});
