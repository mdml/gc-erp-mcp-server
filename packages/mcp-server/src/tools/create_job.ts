/**
 * create_job — TOOLS.md §3.1.
 *
 * Creates a Job under an existing Project. Slug must be unique within the
 * project (SQL-enforced via `jobs_slug_per_project_unique`); we pre-check so
 * the failure is a clean `invariant_violation` instead of a raw SQL error.
 *
 * Not pre-checked: `clientPartyId` — the FK to `parties` is declared
 * structurally on the Job schema but not wired into SQL (see `schema/jobs.ts`
 * and the matching note in `packages/database/CLAUDE.md`). Caller-supplied
 * party ids are accepted as-is; an integrity sweep lands alongside the party
 * wiring.
 */

import {
  IsoDay,
  Job,
  type JobId,
  jobs,
  newJobId,
  PartyId,
  ProjectId,
  projects,
} from "@gc-erp/database";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

export const CreateJobInput = z.object({
  projectId: ProjectId,
  name: z.string(),
  slug: z.string(),
  address: z.string().optional(),
  clientPartyId: PartyId.optional(),
  startedOn: IsoDay.optional(),
});

export const CreateJobOutput = z.object({ job: Job });

export const createJob: McpToolDef<
  typeof CreateJobInput,
  typeof CreateJobOutput
> = {
  name: "create_job",
  description:
    "Create a Job under an existing Project. Slug is unique within the project. Errors: not_found (projectId missing); invariant_violation (slug collides). Returns the created Job.",
  inputSchema: CreateJobInput,
  outputSchema: CreateJobOutput,
  handler: async ({ db, input }) => {
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    if (!project) {
      throw new McpToolError(
        "not_found",
        `project not found: ${input.projectId}`,
        { projectId: input.projectId },
      );
    }

    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(eq(jobs.projectId, input.projectId), eq(jobs.slug, input.slug)),
      )
      .get();
    if (existing) {
      throw new McpToolError(
        "invariant_violation",
        `slug already exists in project: ${input.slug}`,
        { projectId: input.projectId, slug: input.slug },
      );
    }

    const id = newJobId();
    await db
      .insert(jobs)
      .values({
        id,
        projectId: input.projectId,
        name: input.name,
        slug: input.slug,
        address: input.address,
        clientPartyId: input.clientPartyId,
        startedOn: input.startedOn,
      })
      .run();

    const job: Job = Job.parse({
      id: id as unknown as z.output<typeof JobId>,
      projectId: input.projectId,
      name: input.name,
      slug: input.slug,
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.clientPartyId !== undefined
        ? { clientPartyId: input.clientPartyId }
        : {}),
      ...(input.startedOn !== undefined ? { startedOn: input.startedOn } : {}),
    });
    return { job };
  },
};
