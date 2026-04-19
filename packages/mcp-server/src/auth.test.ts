import { describe, expect, it } from "vitest";
import { deriveFapiUrl, timingSafeEqual } from "./auth";

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

describe("deriveFapiUrl", () => {
  it("decodes a pk_live publishable key to Clerk's FAPI URL", () => {
    // base64("clerk.gc.leiserson.me$") → Y2xlcmsuZ2MubGVpc2Vyc29uLm1lJA
    expect(deriveFapiUrl("pk_live_Y2xlcmsuZ2MubGVpc2Vyc29uLm1lJA")).toBe(
      "https://clerk.gc.leiserson.me",
    );
  });

  it("decodes a pk_test publishable key (dev instance)", () => {
    // base64("example-123-45.clerk.accounts.dev$")
    expect(
      deriveFapiUrl("pk_test_ZXhhbXBsZS0xMjMtNDUuY2xlcmsuYWNjb3VudHMuZGV2JA"),
    ).toBe("https://example-123-45.clerk.accounts.dev");
  });

  it("tolerates keys without the trailing $ sentinel", () => {
    // base64("clerk.example.com")
    expect(deriveFapiUrl("pk_live_Y2xlcmsuZXhhbXBsZS5jb20=")).toBe(
      "https://clerk.example.com",
    );
  });
});
