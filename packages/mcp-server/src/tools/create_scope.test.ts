import {
  type JobId,
  jobs,
  type ProjectId,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import { createScope } from "./create_scope";

async function seedJob(): Promise<{
  db: ReturnType<typeof createTestDb>;
  jobId: JobId;
}> {
  const db = createTestDb();
  const projectId = "proj_seed" as ProjectId;
  const jobId = "job_seed" as JobId;
  await db
    .insert(projects)
    .values({ id: projectId, name: "Main St", slug: "main-st" })
    .run();
  await db
    .insert(jobs)
    .values({ id: jobId, projectId, name: "Kitchen", slug: "kitchen" })
    .run();
  return { db, jobId };
}

describe("create_scope", () => {
  it("creates a root scope (no parentId) with the default empty spec", async () => {
    const { db, jobId } = await seedJob();
    const { scope } = await createScope.handler({
      db,
      input: { jobId, name: "Kitchen" },
    });
    expect(scope.id.startsWith("scope_")).toBe(true);
    expect(scope.jobId).toBe(jobId);
    expect(scope.parentId).toBeUndefined();
    expect(scope.name).toBe("Kitchen");
    expect(scope.spec).toEqual({ materials: [] });
  });

  it("creates a child scope under a same-job parent", async () => {
    const { db, jobId } = await seedJob();
    const { scope: root } = await createScope.handler({
      db,
      input: { jobId, name: "Kitchen" },
    });
    const { scope: child } = await createScope.handler({
      db,
      input: { jobId, parentId: root.id, name: "Demo" },
    });
    expect(child.parentId).toBe(root.id);
    const row = await db
      .select()
      .from(scopes)
      .where(eq(scopes.id, child.id))
      .get();
    expect(row?.parentId).toBe(root.id);
  });

  it("persists a supplied spec and omits `code` when not given", async () => {
    const { db, jobId } = await seedJob();
    const { scope } = await createScope.handler({
      db,
      input: {
        jobId,
        name: "Cabinets",
        spec: {
          materials: [
            { sku: "IKEA-BODBYN-W-30", description: "Cabinet", quantity: 4 },
          ],
          installNotes: "Soft-close",
        },
      },
    });
    expect(scope.spec.materials).toHaveLength(1);
    expect(scope.spec.installNotes).toBe("Soft-close");
    expect(scope.code).toBeUndefined();
  });

  it("throws not_found when jobId does not exist", async () => {
    const db = createTestDb();
    const err = await createScope
      .handler({
        db,
        input: { jobId: "job_ghost" as JobId, name: "X" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "not_found",
      details: { jobId: "job_ghost" },
    });
  });

  it("throws invariant_violation when parentId is missing from the job", async () => {
    const { db, jobId } = await seedJob();
    const err = await createScope
      .handler({
        db,
        input: { jobId, parentId: "scope_ghost" as ScopeId, name: "Orphan" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "invariant_violation",
      details: { reason: "missing_parent", jobId },
    });
  });

  it("throws invariant_violation when parentId belongs to a different job", async () => {
    const { db, jobId } = await seedJob();
    // Second job in a second project (projects.slug is globally unique).
    const projectB = "proj_b" as ProjectId;
    const jobB = "job_b" as JobId;
    await db
      .insert(projects)
      .values({ id: projectB, name: "Oak", slug: "oak" })
      .run();
    await db
      .insert(jobs)
      .values({ id: jobB, projectId: projectB, name: "Bath", slug: "bath" })
      .run();
    const { scope: otherRoot } = await createScope.handler({
      db,
      input: { jobId: jobB, name: "Bath root" },
    });

    const err = await createScope
      .handler({
        db,
        input: { jobId, parentId: otherRoot.id, name: "Cross-wire" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "invariant_violation",
      details: { reason: "cross_job_parent" },
    });
  });
});
