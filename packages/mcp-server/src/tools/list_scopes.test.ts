import { type JobId, jobs, type ProjectId, projects } from "@gc-erp/database";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { createScope } from "./create_scope";
import { listScopes } from "./list_scopes";

describe("list_scopes", () => {
  it("returns [] when the job has no scopes", async () => {
    const db = createTestDb();
    const projectId = "proj_x" as ProjectId;
    const jobId = "job_x" as JobId;
    await db
      .insert(projects)
      .values({ id: projectId, name: "X", slug: "x" })
      .run();
    await db
      .insert(jobs)
      .values({ id: jobId, projectId, name: "X", slug: "x" })
      .run();

    const { scopes } = await listScopes.handler({ db, input: { jobId } });
    expect(scopes).toEqual([]);
  });

  it("returns scopes for the job in insertion order and excludes other jobs", async () => {
    const db = createTestDb();
    const projectId = "proj_p" as ProjectId;
    const jobA = "job_a" as JobId;
    const jobB = "job_b" as JobId;
    await db
      .insert(projects)
      .values({ id: projectId, name: "P", slug: "p" })
      .run();
    await db
      .insert(jobs)
      .values([
        { id: jobA, projectId, name: "Kitchen", slug: "kitchen" },
        { id: jobB, projectId, name: "Bath", slug: "bath" },
      ])
      .run();

    const { scope: rootA } = await createScope.handler({
      db,
      input: { jobId: jobA, name: "Kitchen" },
    });
    await createScope.handler({
      db,
      input: { jobId: jobA, parentId: rootA.id, name: "Demo" },
    });
    await createScope.handler({
      db,
      input: { jobId: jobA, parentId: rootA.id, name: "Framing" },
    });
    await createScope.handler({
      db,
      input: { jobId: jobB, name: "Bath root" },
    });

    const { scopes } = await listScopes.handler({
      db,
      input: { jobId: jobA },
    });
    expect(scopes.map((s) => s.name)).toEqual(["Kitchen", "Demo", "Framing"]);
    expect(scopes.every((s) => s.jobId === jobA)).toBe(true);
    expect(scopes[1]?.parentId).toBe(rootA.id);
    expect(scopes[2]?.parentId).toBe(rootA.id);
    expect(scopes[0]?.parentId).toBeUndefined();
  });
});
