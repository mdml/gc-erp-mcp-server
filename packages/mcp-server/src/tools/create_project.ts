/**
 * create_project — TOOLS.md §3.1.
 *
 * Creates a Project. Slug is globally unique across the server
 * (SQL-enforced via `projects.slug UNIQUE`); we pre-check so the failure
 * surfaces as a clean `invariant_violation` instead of a raw SQL error.
 */

import {
  newProjectId,
  Project,
  type ProjectId,
  projects,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

export const CreateProjectInput = z.object({
  name: z.string(),
  slug: z.string(),
});

export const CreateProjectOutput = z.object({ project: Project });

export const createProject: McpToolDef<
  typeof CreateProjectInput,
  typeof CreateProjectOutput
> = {
  name: "create_project",
  description:
    "Create a Project. Slug is unique across the server. Errors: invariant_violation (slug collides). Returns the created Project.",
  inputSchema: CreateProjectInput,
  outputSchema: CreateProjectOutput,
  handler: async ({ db, input }) => {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, input.slug))
      .get();
    if (existing) {
      throw new McpToolError(
        "invariant_violation",
        `project slug already exists: ${input.slug}`,
        { slug: input.slug },
      );
    }

    const id = newProjectId();
    await db
      .insert(projects)
      .values({ id, name: input.name, slug: input.slug })
      .run();

    const project: Project = Project.parse({
      id: id as unknown as z.output<typeof ProjectId>,
      name: input.name,
      slug: input.slug,
    });
    return { project };
  },
};
