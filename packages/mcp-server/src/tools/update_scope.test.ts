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
import { updateScope } from "./update_scope";

async function seedScope(): Promise<{
  db: ReturnType<typeof createTestDb>;
  jobId: JobId;
  rootId: ScopeId;
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
  const { scope } = await createScope.handler({
    db,
    input: { jobId, name: "Kitchen" },
  });
  return { db, jobId, rootId: scope.id };
}

describe("update_scope", () => {
  it("updates spec and returns the full entity", async () => {
    const { db, rootId } = await seedScope();
    const { scope } = await updateScope.handler({
      db,
      input: {
        scopeId: rootId,
        fields: {
          spec: {
            materials: [
              { description: "Cabinets", sku: "IKEA-BODBYN-W-30", quantity: 4 },
            ],
            installNotes: "Soft-close, level to countertop",
          },
        },
      },
    });
    expect(scope.id).toBe(rootId);
    expect(scope.spec.installNotes).toBe("Soft-close, level to countertop");

    const row = await db
      .select()
      .from(scopes)
      .where(eq(scopes.id, rootId))
      .get();
    expect(row?.spec.installNotes).toBe("Soft-close, level to countertop");
  });

  it("updates name only, preserving spec and code", async () => {
    const { db, rootId } = await seedScope();
    // Seed a code on the row so we can verify it's preserved.
    await db
      .update(scopes)
      .set({ code: "01-000" })
      .where(eq(scopes.id, rootId))
      .run();
    const { scope } = await updateScope.handler({
      db,
      input: { scopeId: rootId, fields: { name: "Kitchen Suite" } },
    });
    expect(scope.name).toBe("Kitchen Suite");
    expect(scope.code).toBe("01-000");
    expect(scope.spec).toEqual({ materials: [] });
  });

  it("throws validation_error on empty fields object", async () => {
    const { db, rootId } = await seedScope();
    const err = await updateScope
      .handler({
        db,
        input: { scopeId: rootId, fields: {} },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "validation_error",
      details: { scopeId: rootId },
    });
  });

  it("throws not_found when scopeId does not exist", async () => {
    const db = createTestDb();
    const err = await updateScope
      .handler({
        db,
        input: {
          scopeId: "scope_ghost" as ScopeId,
          fields: { name: "X" },
        },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({ code: "not_found" });
  });
});
