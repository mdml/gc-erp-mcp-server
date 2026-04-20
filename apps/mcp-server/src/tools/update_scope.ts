/**
 * update_scope — TOOLS.md §3.1.
 *
 * Partial updates to `name`, `code`, and `spec`. Structural fields
 * (`jobId`, `parentId`) are intentionally not writable here: the Day-0
 * walkthrough only edits `spec`, and reparenting invokes the same
 * `assertScopeTreeInvariants` machinery that `create_scope` already uses —
 * lands alongside the first consumer that actually needs tree-rearrangement
 * (likely M4 dashboard).
 *
 * The `fields` object must include at least one updatable key; empty
 * updates are rejected as `validation_error` so callers get a clear
 * signal rather than a silent no-op.
 */

import { Scope, ScopeId, ScopeSpec, scopes } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

export const UpdateScopeFields = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  spec: ScopeSpec.optional(),
});

export const UpdateScopeInput = z.object({
  scopeId: ScopeId,
  fields: UpdateScopeFields,
});

export const UpdateScopeOutput = z.object({ scope: Scope });

function isEmpty(fields: z.output<typeof UpdateScopeFields>): boolean {
  return (
    fields.name === undefined &&
    fields.code === undefined &&
    fields.spec === undefined
  );
}

function pickCode(
  fieldCode: string | undefined,
  existingCode: string | null,
): string | undefined {
  if (fieldCode !== undefined) return fieldCode;
  return existingCode ?? undefined;
}

export const updateScope: McpToolDef<
  typeof UpdateScopeInput,
  typeof UpdateScopeOutput
> = {
  name: "update_scope",
  description:
    "Update a Scope's `name`, `code`, and/or `spec`. Structural fields (jobId, parentId) are not writable — create a new scope to reparent. Errors: not_found (scopeId), validation_error (empty update). Returns the updated Scope.",
  inputSchema: UpdateScopeInput,
  outputSchema: UpdateScopeOutput,
  handler: async ({ db, input }) => {
    if (isEmpty(input.fields)) {
      throw new McpToolError(
        "validation_error",
        "fields must include at least one of name, code, spec",
        { scopeId: input.scopeId },
      );
    }

    const existing = await db
      .select()
      .from(scopes)
      .where(eq(scopes.id, input.scopeId))
      .get();
    if (!existing) {
      throw new McpToolError("not_found", `scope not found: ${input.scopeId}`, {
        scopeId: input.scopeId,
      });
    }

    const { name, code, spec } = input.fields;
    const nextName = name ?? existing.name;
    const nextSpec = spec ?? existing.spec;
    const nextCode = pickCode(code, existing.code);

    // Only write `code` when the caller supplied it — otherwise leave the
    // column untouched rather than setting it to drizzle's `undefined`.
    const codeSet = code !== undefined ? { code } : {};
    await db
      .update(scopes)
      .set({ name: nextName, spec: nextSpec, ...codeSet })
      .where(eq(scopes.id, input.scopeId))
      .run();

    const parentSet =
      existing.parentId !== null ? { parentId: existing.parentId } : {};
    const nextCodeSet = nextCode !== undefined ? { code: nextCode } : {};
    const scope: Scope = Scope.parse({
      id: existing.id,
      jobId: existing.jobId,
      name: nextName,
      spec: nextSpec,
      ...parentSet,
      ...nextCodeSet,
    });
    return { scope };
  },
};
