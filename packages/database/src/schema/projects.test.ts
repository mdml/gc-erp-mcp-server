import { describe, expect, it } from "vitest";
import { Project } from "./projects";

describe("Project Zod", () => {
  it("round-trips a minimal valid project", () => {
    const input = {
      id: "proj_V1StGXR8_Z5jdHi6B-myT",
      name: "Main St Remodel",
      slug: "main-st",
    };
    const parsed = Project.parse(input);
    expect(parsed).toEqual(input);
    expect(Project.parse(parsed)).toEqual(input);
  });

  it("rejects missing id/name/slug", () => {
    expect(() => Project.parse({ name: "x", slug: "y" })).toThrow();
    expect(() => Project.parse({ id: "proj_1", slug: "y" })).toThrow();
    expect(() => Project.parse({ id: "proj_1", name: "x" })).toThrow();
  });

  it("rejects empty id (brand enforces min(1))", () => {
    expect(() => Project.parse({ id: "", name: "x", slug: "y" })).toThrow();
  });
});
