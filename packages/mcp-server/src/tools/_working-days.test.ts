import { describe, expect, it } from "vitest";
import { addWorkingDays } from "./_working-days";

describe("addWorkingDays", () => {
  // TOOLS.md §6 Day 10 canonical example
  it("Mon 2026-04-27 + 5 → Mon 2026-05-04", () => {
    expect(addWorkingDays("2026-04-27", 5)).toBe("2026-05-04");
  });

  it("Mon 2026-05-04 + 1 → Tue 2026-05-05", () => {
    expect(addWorkingDays("2026-05-04", 1)).toBe("2026-05-05");
  });

  it("n = 0 is a no-op for a weekday", () => {
    expect(addWorkingDays("2026-04-27", 0)).toBe("2026-04-27");
  });

  it("n = 0 is a no-op for a weekend day (no normalization)", () => {
    expect(addWorkingDays("2026-04-25", 0)).toBe("2026-04-25"); // Saturday
  });

  it("Friday + 1 → following Monday", () => {
    expect(addWorkingDays("2026-05-01", 1)).toBe("2026-05-04"); // Fri → Mon
  });

  it("Saturday + 1 → Tuesday (Sat advances to Mon, then 1 forward)", () => {
    expect(addWorkingDays("2026-04-25", 1)).toBe("2026-04-28"); // Sat→Mon, +1→Tue
  });

  it("n < 0 throws RangeError", () => {
    expect(() => addWorkingDays("2026-04-27", -1)).toThrow(RangeError);
  });
});
