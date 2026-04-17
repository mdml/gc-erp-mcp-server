import { describe, expect, it } from "vitest";
import { Activity } from "./activities";

describe("Activity Zod", () => {
  it("round-trips with and without defaultUnit", () => {
    const noUnit = {
      id: "act_V1StGXR8_Z5jdHi6B-myT",
      name: "Lumber Drop",
      slug: "lumber_drop",
    };
    expect(Activity.parse(noUnit)).toEqual(noUnit);

    const withUnit = { ...noUnit, defaultUnit: "lf" };
    expect(Activity.parse(withUnit)).toEqual(withUnit);
  });

  it("requires id, name, slug", () => {
    expect(() => Activity.parse({ name: "x", slug: "y" })).toThrow();
    expect(() => Activity.parse({ id: "act_1", slug: "y" })).toThrow();
    expect(() => Activity.parse({ id: "act_1", name: "x" })).toThrow();
  });
});
