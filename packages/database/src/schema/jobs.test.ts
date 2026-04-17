import { describe, expect, it } from "vitest";
import { Job } from "./jobs";

describe("Job Zod", () => {
  const minimal = {
    id: "job_V1StGXR8_Z5jdHi6B-myT",
    projectId: "proj_V1StGXR8_Z5jdHi6B-myT",
    name: "Kitchen",
    slug: "kitchen",
  };

  it("round-trips minimal and full shapes", () => {
    expect(Job.parse(minimal)).toEqual(minimal);

    const full = {
      ...minimal,
      address: "123 Main St",
      clientPartyId: "party_V1StGXR8_Z5jdHi6B-myT",
      startedOn: "2026-04-18",
    };
    expect(Job.parse(full)).toEqual(full);
    expect(Job.parse(Job.parse(full))).toEqual(full);
  });

  it("requires id, projectId, name, slug", () => {
    expect(() => Job.parse({ ...minimal, id: undefined })).toThrow();
    expect(() => Job.parse({ ...minimal, projectId: undefined })).toThrow();
    expect(() => Job.parse({ ...minimal, name: undefined })).toThrow();
    expect(() => Job.parse({ ...minimal, slug: undefined })).toThrow();
  });

  it("rejects a malformed startedOn", () => {
    expect(() => Job.parse({ ...minimal, startedOn: "4/18/2026" })).toThrow();
  });
});
