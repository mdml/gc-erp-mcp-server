import { describe, expect, it } from "vitest";
import { Scope, ScopeSpec } from "./scopes";

describe("ScopeSpec Zod", () => {
  it("defaults materials to []", () => {
    expect(ScopeSpec.parse({})).toEqual({ materials: [] });
  });

  it("round-trips a spec with materials, notes, and refs", () => {
    const spec = {
      materials: [
        { sku: "IKEA-BODBYN-W-30", description: "base cabinet", quantity: 4 },
        {
          sku: "CAMBRIA-BRITANNICA-3CM",
          description: "countertop slab",
          quantity: 42,
          unit: "sqft",
        },
      ],
      installNotes: "Soft-close; level to template",
      planRef: "plan://kitchen/A-101",
      optionRef: "option://upgrade-2",
    };
    expect(ScopeSpec.parse(spec)).toEqual(spec);
  });
});

describe("Scope Zod", () => {
  const minimal = {
    id: "scope_V1StGXR8_Z5jdHi6B-myT",
    jobId: "job_V1StGXR8_Z5jdHi6B-myT",
    name: "Kitchen",
  };

  it("round-trips a root scope with defaults", () => {
    const parsed = Scope.parse(minimal);
    expect(parsed).toMatchObject({ ...minimal, spec: { materials: [] } });
    expect(Scope.parse(parsed)).toEqual(parsed);
  });

  it("round-trips a child scope with parentId", () => {
    const child = {
      ...minimal,
      id: "scope_child",
      parentId: minimal.id,
      name: "Demo",
      code: "01-30",
    };
    expect(Scope.parse(child)).toMatchObject(child);
  });

  it("requires id, jobId, name", () => {
    expect(() => Scope.parse({ ...minimal, id: undefined })).toThrow();
    expect(() => Scope.parse({ ...minimal, jobId: undefined })).toThrow();
    expect(() => Scope.parse({ ...minimal, name: undefined })).toThrow();
  });
});
