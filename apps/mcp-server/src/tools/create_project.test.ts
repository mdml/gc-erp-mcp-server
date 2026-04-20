import { projects } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import { createProject } from "./create_project";

describe("create_project", () => {
  it("creates a Project and returns the full entity", async () => {
    const db = createTestDb();
    const { project } = await createProject.handler({
      db,
      input: { name: "Main St Remodel", slug: "main-st" },
    });
    expect(project.name).toBe("Main St Remodel");
    expect(project.slug).toBe("main-st");
    expect(project.id.startsWith("proj_")).toBe(true);

    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, "main-st"))
      .get();
    expect(row?.id).toBe(project.id);
    expect(row?.name).toBe("Main St Remodel");
  });

  it("throws invariant_violation on duplicate slug", async () => {
    const db = createTestDb();
    await createProject.handler({
      db,
      input: { name: "First", slug: "main-st" },
    });

    const err = await createProject
      .handler({
        db,
        input: { name: "Second", slug: "main-st" },
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(McpToolError);
    expect(err).toMatchObject({
      code: "invariant_violation",
      details: { slug: "main-st" },
    });
  });

  it("allows multiple projects with distinct slugs", async () => {
    const db = createTestDb();
    const { project: a } = await createProject.handler({
      db,
      input: { name: "A", slug: "a" },
    });
    const { project: b } = await createProject.handler({
      db,
      input: { name: "B", slug: "b" },
    });
    expect(a.id).not.toBe(b.id);
    expect(a.slug).not.toBe(b.slug);
  });
});
