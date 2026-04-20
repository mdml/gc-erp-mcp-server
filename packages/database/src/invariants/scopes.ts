import type { JobId, ScopeId } from "../schema/ids";

/**
 * Scope tree invariants that SQL can't express:
 *
 *   (1) `parentId` resolves to a scope with the same `jobId` — a Kitchen
 *       scope can't sit under a Basement job's framing scope.
 *   (2) No cycles — `parent→parent→…` must terminate at a root.
 *
 * Callers are the `create_scope` / `update_scope` tools in `apps/mcp-server`.
 * Pass `siblings` = every scope currently in the same job (including the
 * candidate when updating) so we can walk ancestry without hitting D1.
 */

export class ScopeInvariantError extends Error {
  constructor(
    readonly code: "cross_job_parent" | "missing_parent" | "cycle",
    message: string,
  ) {
    super(message);
    this.name = "ScopeInvariantError";
  }
}

export interface ScopeNodeRef {
  id: ScopeId;
  jobId: JobId;
  parentId?: ScopeId;
}

/**
 * Validate a candidate scope against the existing set in its job. Throws
 * `ScopeInvariantError` on failure; returns void on success. Existing
 * `siblings` should NOT include the candidate (for creates) or should
 * already have the candidate in its post-update form (for updates).
 */
export function assertScopeTreeInvariants(
  candidate: ScopeNodeRef,
  siblings: readonly ScopeNodeRef[],
): void {
  if (candidate.parentId === undefined) return;

  const byId = new Map<ScopeId, ScopeNodeRef>();
  for (const s of siblings) byId.set(s.id, s);
  byId.set(candidate.id, candidate);

  const parent = byId.get(candidate.parentId);
  if (!parent) {
    throw new ScopeInvariantError(
      "missing_parent",
      `parentId ${candidate.parentId} is not in the job's scope set`,
    );
  }
  if (parent.jobId !== candidate.jobId) {
    throw new ScopeInvariantError(
      "cross_job_parent",
      `parent scope ${parent.id} belongs to job ${parent.jobId}, not ${candidate.jobId}`,
    );
  }

  // Walk ancestors. If we ever see `candidate.id` again, there's a cycle.
  const seen = new Set<ScopeId>();
  let cursor: ScopeNodeRef | undefined = parent;
  while (cursor) {
    if (cursor.id === candidate.id) {
      throw new ScopeInvariantError(
        "cycle",
        `cycle detected: ${candidate.id} is an ancestor of its parent`,
      );
    }
    if (seen.has(cursor.id)) {
      // Pre-existing cycle in `siblings` — surface distinctly.
      throw new ScopeInvariantError(
        "cycle",
        `pre-existing cycle detected at ${cursor.id}`,
      );
    }
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
}
