import { type ProjectId, projects } from "@gc-erp/database";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { createJob } from "./create_job";
import { listJobs } from "./list_jobs";

describe("list_jobs", () => {
  it("returns an empty array when no jobs exist", async () => {
    const db = createTestDb();
    const { jobs } = await listJobs.handler({ db, input: {} });
    expect(jobs).toEqual([]);
  });

  it("returns jobs across multiple projects with optional fields populated or omitted", async () => {
    const db = createTestDb();
    const pA = "proj_a" as ProjectId;
    const pB = "proj_b" as ProjectId;
    await db
      .insert(projects)
      .values([
        { id: pA, name: "Main St", slug: "main-st" },
        { id: pB, name: "Oak Ave", slug: "oak-ave" },
      ])
      .run();

    await createJob.handler({
      db,
      input: {
        projectId: pA,
        name: "Kitchen",
        slug: "kitchen",
        address: "123 Main St",
        startedOn: "2026-04-18",
      },
    });
    await createJob.handler({
      db,
      input: { projectId: pB, name: "Bath", slug: "bath" },
    });

    const { jobs } = await listJobs.handler({ db, input: {} });
    expect(jobs).toHaveLength(2);

    const kitchen = jobs.find((j) => j.slug === "kitchen");
    const bath = jobs.find((j) => j.slug === "bath");
    expect(kitchen?.projectId).toBe(pA);
    expect(kitchen?.address).toBe("123 Main St");
    expect(kitchen?.startedOn).toBe("2026-04-18");
    expect(bath?.projectId).toBe(pB);
    expect(bath?.address).toBeUndefined();
    expect(bath?.clientPartyId).toBeUndefined();
    expect(bath?.startedOn).toBeUndefined();
  });
});
