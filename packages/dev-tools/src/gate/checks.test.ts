import { describe, expect, it } from "vitest";
import { getGateChecks } from "./checks";

describe("getGateChecks", () => {
  it("returns lint, typecheck, and test (no coverage)", () => {
    const checks = getGateChecks(false);
    expect(checks.map((c) => c.name)).toEqual([
      "TypeScript (all)",
      "Lint (all)",
      "Tests (all)",
    ]);
    expect(checks[2].cmd).toEqual(["bunx", "turbo", "test"]);
  });

  it("swaps test for test:coverage when coverage is requested", () => {
    const checks = getGateChecks(true);
    expect(checks.map((c) => c.name)).toEqual([
      "TypeScript (all)",
      "Lint (all)",
      "Tests + Coverage",
    ]);
    expect(checks[2].cmd).toEqual(["bunx", "turbo", "test:coverage"]);
  });

  it("does not include code-health (Code Health is a separate lefthook hook per ADR 0015)", () => {
    const names = [
      ...getGateChecks(false).map((c) => c.name),
      ...getGateChecks(true).map((c) => c.name),
    ];
    expect(names.some((n) => n.toLowerCase().includes("code health"))).toBe(
      false,
    );
  });
});
