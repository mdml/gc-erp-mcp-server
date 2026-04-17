import type { Cost } from "../schema/costs";
import type { CommitmentId, JobId, ScopeId } from "../schema/ids";

/**
 * Cost cross-entity invariants — SPEC §1:
 *
 *   (1) Cost.scopeId's Scope.jobId      == Cost.jobId
 *   (2) Cost.commitmentId's Commitment.jobId == Cost.jobId
 *
 * SQL FK enforces existence; SQL can't cross-reference two tables' columns
 * without a denormalized job_id on commitments + scopes (which we have), but
 * it still can't enforce the equality without a trigger. Trigger-free
 * approach: the `record_cost` tool calls this validator before INSERT.
 *
 * Callers pre-fetch the referenced Scope.jobId and Commitment.jobId and
 * pass the pair so this stays a pure function.
 */

export class CostInvariantError extends Error {
  constructor(
    readonly code: "scope_job_mismatch" | "commitment_job_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "CostInvariantError";
  }
}

export interface CostContext {
  scope: { id: ScopeId; jobId: JobId };
  commitment: { id: CommitmentId; jobId: JobId };
}

export function assertCostReferencesSameJob(
  cost: Cost,
  ctx: CostContext,
): void {
  if (ctx.scope.jobId !== cost.jobId) {
    throw new CostInvariantError(
      "scope_job_mismatch",
      `Cost.jobId=${cost.jobId} but scope ${ctx.scope.id} belongs to job ${ctx.scope.jobId}`,
    );
  }
  if (ctx.commitment.jobId !== cost.jobId) {
    throw new CostInvariantError(
      "commitment_job_mismatch",
      `Cost.jobId=${cost.jobId} but commitment ${ctx.commitment.id} belongs to job ${ctx.commitment.jobId}`,
    );
  }
}
