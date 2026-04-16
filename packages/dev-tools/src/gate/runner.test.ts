import { describe, expect, it } from "vitest";
import type { CheckResult } from "./checks";
import { extractFailureLines, formatResults } from "./runner";

describe("extractFailureLines", () => {
  it("extracts lines matching FAIL/ERROR/failed/error:", () => {
    const output = [
      "running tests...",
      "FAIL src/foo.test.ts",
      "  Error: expected 1 to be 2",
      "  error: thrown from x",
      "ok",
      "some other line",
    ].join("\n");

    const lines = extractFailureLines(output);

    expect(lines).toEqual([
      "FAIL src/foo.test.ts",
      "  Error: expected 1 to be 2",
      "  error: thrown from x",
    ]);
  });

  it("returns an empty array when no failures are present", () => {
    expect(extractFailureLines("all green\n4 passed")).toEqual([]);
  });

  it("caps results at 30 lines", () => {
    const output = Array.from({ length: 50 }, () => "ERROR boom").join("\n");
    expect(extractFailureLines(output)).toHaveLength(30);
  });

  it("matches case-insensitively", () => {
    expect(extractFailureLines("fail: nope\nERROR: boom")).toEqual([
      "fail: nope",
      "ERROR: boom",
    ]);
  });
});

describe("formatResults", () => {
  const passing: CheckResult = {
    name: "Lint",
    passed: true,
    output: "ok",
    durationMs: 12,
  };
  const failing: CheckResult = {
    name: "Tests",
    passed: false,
    output: "FAIL src/a.test.ts\nok src/b.test.ts",
    durationMs: 42,
  };

  it("prints pass/fail counts and 'Gate passed.' when all passed", () => {
    const out = formatResults([passing, passing], false);
    expect(out).toContain("Passed: 2");
    expect(out).toContain("Failed: 0");
    expect(out).toContain("Gate passed.");
  });

  it("omits 'Gate passed.' when any check failed", () => {
    const out = formatResults([passing, failing], false);
    expect(out).toContain("Passed: 1");
    expect(out).toContain("Failed: 1");
    expect(out).not.toContain("Gate passed.");
  });

  it("in non-summary mode, includes full output for passing checks", () => {
    const r: CheckResult = { ...passing, output: "lint-ok-marker" };
    const out = formatResults([r], false);
    expect(out).toContain("lint-ok-marker");
  });

  it("in summary mode, suppresses passing-check output", () => {
    const r: CheckResult = { ...passing, output: "lint-ok-marker" };
    const out = formatResults([r], true);
    expect(out).not.toContain("lint-ok-marker");
    expect(out).toContain("\u2713 Lint passed");
  });

  it("in summary mode for failing checks, shows only extracted failure lines", () => {
    const r: CheckResult = {
      ...failing,
      output: "random noise\nFAIL here\nmore noise",
    };
    const out = formatResults([r], true);
    expect(out).toContain("FAIL here");
    expect(out).not.toContain("random noise");
  });

  it("in non-summary mode for failing checks, shows full output", () => {
    const r: CheckResult = { ...failing, output: "full\noutput\nblob" };
    const out = formatResults([r], false);
    expect(out).toContain("full\noutput\nblob");
  });
});
