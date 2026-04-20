/**
 * list_jobs — TOOLS.md §4.
 *
 * Returns every Job across every Project. No filtering; callers scope via
 * `get_job` / `get_scope_tree` once they know what they want. Rows are parsed
 * through `Job` so the output contract matches SPEC.md §1 regardless of what
 * the underlying table can express.
 */

import { Job, jobs } from "@gc-erp/database";
import { z } from "zod";
import type { McpToolDef } from "./_mcp-tool";

export const ListJobsInput = z.object({});
export const ListJobsOutput = z.object({ jobs: z.array(Job) });

export const listJobs: McpToolDef<typeof ListJobsInput, typeof ListJobsOutput> =
  {
    name: "list_jobs",
    description:
      "List every Job across every Project. Returns { jobs: Job[] }. Use this for orientation before drilling into a specific job.",
    inputSchema: ListJobsInput,
    outputSchema: ListJobsOutput,
    handler: async ({ db }) => {
      const rows = await db.select().from(jobs).all();
      const parsed = rows.map((row) =>
        Job.parse({
          id: row.id,
          projectId: row.projectId,
          name: row.name,
          slug: row.slug,
          ...(row.address !== null ? { address: row.address } : {}),
          ...(row.clientPartyId !== null
            ? { clientPartyId: row.clientPartyId }
            : {}),
          ...(row.startedOn !== null ? { startedOn: row.startedOn } : {}),
        }),
      );
      return { jobs: parsed };
    },
  };
