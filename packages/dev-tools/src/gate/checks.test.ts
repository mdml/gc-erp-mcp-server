import { describe, expect, it } from "vitest";
import { parseCodeHealthOutput } from "./checks";

describe("parseCodeHealthOutput", () => {
  it("extracts the score and warnings from a realistic cs check fixture", () => {
    const output = [
      "Analyzing packages/mcp-server/src/handler.ts",
      "Code health score: 8.5",
      "warn: Complex Method (score 3) in handleRequest",
      "warn: Large Method (score 2) in handleRequest",
      "info: function count = 4",
    ].join("\n");

    const parsed = parseCodeHealthOutput(output);

    expect(parsed.score).toBe("8.5");
    expect(parsed.warnings).toEqual([
      "warn: Complex Method (score 3) in handleRequest",
      "warn: Large Method (score 2) in handleRequest",
    ]);
  });

  it("preserves the raw score string (no float coercion)", () => {
    expect(parseCodeHealthOutput("Code health score: 10.0").score).toBe("10.0");
    expect(parseCodeHealthOutput("Code health score: 10").score).toBe("10");
  });

  it("preserves N/A as a non-numeric pass signal (trivial files cs chose not to score)", () => {
    const parsed = parseCodeHealthOutput(
      "info: packages/dev-tools/src/gate.ts:1: Code health score: N/A\n",
    );
    expect(parsed.score).toBe("N/A");
    expect(parsed.warnings).toEqual([]);
  });

  it("returns score=null when no score line is present (unmeasured)", () => {
    const output = [
      "error: could not authenticate with CodeScene",
      "check CS_ACCESS_TOKEN",
    ].join("\n");

    const parsed = parseCodeHealthOutput(output);

    expect(parsed.score).toBeNull();
    expect(parsed.warnings).toEqual([]);
  });

  it("slices warnings to at most 5", () => {
    const output = [
      "Code health score: 6.0",
      ...Array.from({ length: 8 }, (_, i) => `warn: issue ${i + 1}`),
    ].join("\n");

    const parsed = parseCodeHealthOutput(output);

    expect(parsed.warnings).toHaveLength(5);
    expect(parsed.warnings[0]).toBe("warn: issue 1");
    expect(parsed.warnings[4]).toBe("warn: issue 5");
  });

  it("returns empty warnings when only a score line is present", () => {
    const parsed = parseCodeHealthOutput("Code health score: 10.0\n");

    expect(parsed.score).toBe("10.0");
    expect(parsed.warnings).toEqual([]);
  });
});
