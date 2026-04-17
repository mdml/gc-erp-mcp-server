/**
 * create_scope — TOOLS.md §3.1.
 *
 * Inserts a Scope node under an existing Job. Two invariants SQL can't
 * express (same-job parent, acyclicity) are enforced via the pure validator
 * in `@gc-erp/database` before the write. `ScopeInvariantError` is mapped
 * to `invariant_violation` so the MCP client sees a structured failure
 * consistent with every other write tool.
 *
 * `spec` defaults to `{ materials: [] }` — the SPEC/Drizzle default — so
 * Day 0 scaffolding calls that only pass `{ jobId, parentId?, name }` work
 * without the caller reasoning about ScopeSpec's shape.
 */

import {
  assertScopeTreeInvariants,
  type DatabaseClient,
  JobId,
  jobs,
  newScopeId,
  Scope,
  ScopeId,
  ScopeInvariantError,
  type ScopeNodeRef,
  ScopeSpec,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

type ScopeRow = Pick<typeof scopes.$inferSelect, "id" | "jobId" | "parentId">;

function rowToRef(row: ScopeRow): ScopeNodeRef {
  return {
    id: row.id,
    jobId: row.jobId,
    ...(row.parentId !== null ? { parentId: row.parentId } : {}),
  };
}

async function validateParent(
  db: DatabaseClient,
  jobId: z.output<typeof JobId>,
  parentId: z.output<typeof ScopeId>,
  candidateId: z.output<typeof ScopeId>,
): Promise<void> {
  const parent = await db
    .select({ id: scopes.id, jobId: scopes.jobId, parentId: scopes.parentId })
    .from(scopes)
    .where(eq(scopes.id, parentId))
    .get();
  const siblings = await db
    .select({ id: scopes.id, jobId: scopes.jobId, parentId: scopes.parentId })
    .from(scopes)
    .where(eq(scopes.jobId, jobId))
    .all();

  // Include the parent in the ref set only when it's cross-job — otherwise
  // it's already in `siblings`. This keeps the validator able to
  // distinguish cross_job_parent from missing_parent.
  const refs: ScopeNodeRef[] = siblings.map(rowToRef);
  if (parent && parent.jobId !== jobId) refs.push(rowToRef(parent));

  try {
    assertScopeTreeInvariants({ id: candidateId, jobId, parentId }, refs);
  } catch (err) {
    if (err instanceof ScopeInvariantError) {
      throw new McpToolError("invariant_violation", err.message, {
        reason: err.code,
        jobId,
        parentId,
      });
    }
    throw err;
  }
}

export const CreateScopeInput = z.object({
  jobId: JobId,
  parentId: ScopeId.optional(),
  name: z.string(),
  code: z.string().optional(),
  spec: ScopeSpec.optional(),
});

export const CreateScopeOutput = z.object({ scope: Scope });

export const createScope: McpToolDef<
  typeof CreateScopeInput,
  typeof CreateScopeOutput
> = {
  name: "create_scope",
  description:
    "Create a Scope under an existing Job. `parentId` (if supplied) must resolve to a scope in the same job; cycles are rejected. Errors: not_found (jobId missing); invariant_violation (parent cross-job, missing, or cycle). Returns the created Scope.",
  inputSchema: CreateScopeInput,
  outputSchema: CreateScopeOutput,
  handler: async ({ db, input }) => {
    const job = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .get();
    if (!job) {
      throw new McpToolError("not_found", `job not found: ${input.jobId}`, {
        jobId: input.jobId,
      });
    }

    const id = newScopeId();

    if (input.parentId !== undefined) {
      await validateParent(db, input.jobId, input.parentId, id);
    }

    const spec = input.spec ?? ScopeSpec.parse({});
    await db
      .insert(scopes)
      .values({
        id,
        jobId: input.jobId,
        parentId: input.parentId,
        name: input.name,
        code: input.code,
        spec,
      })
      .run();

    const scope: Scope = Scope.parse({
      id,
      jobId: input.jobId,
      name: input.name,
      spec,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
    });
    return { scope };
  },
};
