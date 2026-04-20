import {
  type DatabaseClient,
  type ProjectId,
  projects,
} from "@gc-erp/database";
import { describe, expect, it } from "vitest";
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import { createJob } from "./create_job";

async function seedProject(
  db: DatabaseClient,
  id: ProjectId,
  slug: string,
): Promise<void> {
  await db.insert(projects).values({ id, name: "Kitchen", slug }).run();
}

describe("create_job", () => {
  it("creates a Job under an existing project and returns the full entity", async () => {
    const db = createTestDb();
    const projectId = "proj_main" as ProjectId;
    await seedProject(db, projectId, "main-st");

    const { job } = await createJob.handler({
      db,
      input: {
        projectId,
        name: "Kitchen",
        slug: "kitchen",
        address: "123 Main St",
        startedOn: "2026-04-18",
      },
    });

    expect(job.projectId).toBe(projectId);
    expect(job.name).toBe("Kitchen");
    expect(job.slug).toBe("kitchen");
    expect(job.address).toBe("123 Main St");
    expect(job.startedOn).toBe("2026-04-18");
    expect(job.clientPartyId).toBeUndefined();
    expect(job.id.startsWith("job_")).toBe(true);
  });

  it("omits optional fields that weren't supplied (Job.parse drops undefined)", async () => {
    const db = createTestDb();
    const projectId = "proj_bare" as ProjectId;
    await seedProject(db, projectId, "bare");

    const { job } = await createJob.handler({
      db,
      input: { projectId, name: "A", slug: "a" },
    });

    expect(job.address).toBeUndefined();
    expect(job.clientPartyId).toBeUndefined();
    expect(job.startedOn).toBeUndefined();
  });

  it("throws not_found when projectId does not exist", async () => {
    const db = createTestDb();
    await expect(
      createJob.handler({
        db,
        input: {
          projectId: "proj_ghost" as ProjectId,
          name: "A",
          slug: "a",
        },
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { projectId: "proj_ghost" },
    });
  });

  it("throws invariant_violation when slug already exists in the project", async () => {
    const db = createTestDb();
    const projectId = "proj_dupe" as ProjectId;
    await seedProject(db, projectId, "dupe");

    await createJob.handler({
      db,
      input: { projectId, name: "First", slug: "kitchen" },
    });

    const err = await createJob
      .handler({
        db,
        input: { projectId, name: "Second", slug: "kitchen" },
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "invariant_violation",
      details: { projectId, slug: "kitchen" },
    });
  });

  it("allows the same slug across different projects", async () => {
    const db = createTestDb();
    const projectA = "proj_a" as ProjectId;
    const projectB = "proj_b" as ProjectId;
    await seedProject(db, projectA, "a");
    await seedProject(db, projectB, "b");

    const { job: a } = await createJob.handler({
      db,
      input: { projectId: projectA, name: "K", slug: "kitchen" },
    });
    const { job: b } = await createJob.handler({
      db,
      input: { projectId: projectB, name: "K", slug: "kitchen" },
    });
    expect(a.id).not.toBe(b.id);
    expect(a.slug).toBe(b.slug);
  });
});
