/**
 * list_scopes — TOOLS.md §4 (read surface for Day 0 assertions).
 *
 * Returns every Scope for a given Job in insertion order. Deliberately
 * flat — `get_scope_tree` (the dashboard-flavored read with committed/cost
 * rollups) is a separate tool that lands alongside the first commitment-
 * driven assertion. For Day 0 the scenario runner only needs to verify
 * parent/child shape and names, which this provides.
 */

import { JobId, Scope, scopes } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { McpToolDef } from "./_mcp-tool";

export const ListScopesInput = z.object({ jobId: JobId });
export const ListScopesOutput = z.object({ scopes: z.array(Scope) });

export const listScopes: McpToolDef<
  typeof ListScopesInput,
  typeof ListScopesOutput
> = {
  name: "list_scopes",
  description:
    "List every Scope for a Job in insertion order (flat, not a tree). Returns { scopes: Scope[] }. Use before `get_scope_tree` lands, or to verify shape without pulling commitment rollups.",
  inputSchema: ListScopesInput,
  outputSchema: ListScopesOutput,
  handler: async ({ db, input }) => {
    const rows = await db
      .select()
      .from(scopes)
      .where(eq(scopes.jobId, input.jobId))
      .all();
    const parsed = rows.map((row) =>
      Scope.parse({
        id: row.id,
        jobId: row.jobId,
        name: row.name,
        spec: row.spec,
        ...(row.parentId !== null ? { parentId: row.parentId } : {}),
        ...(row.code !== null ? { code: row.code } : {}),
      }),
    );
    return { scopes: parsed };
  },
};
