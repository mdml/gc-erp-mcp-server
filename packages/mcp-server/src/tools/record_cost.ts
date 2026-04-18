/**
 * record_cost — TOOLS.md §3.2 / §3.3, SPEC §1 Cost.
 *
 * Append-only money event. The handler validates the FK + cross-entity
 * invariants the Cost Zod schema and SQL can't express on their own:
 *
 *   - scope.jobId == input.jobId        (SPEC §1)
 *   - commitment.jobId == input.jobId   (SPEC §1)
 *   - commitment is not voided          (ADR 0006 / 0009)
 *   - input.activityId appears on one of the commitment's activations
 *   - input.activationId (if provided) belongs to input.commitmentId AND
 *     the activation's activityId equals input.activityId
 *
 * The last two bullets are NOT explicit in SPEC §1; they're the posture of
 * "a cost's activity must line up with what the commitment actually covers"
 * — flagged in the PR body for Max to ratify.
 *
 * Single-row insert; no batch — this tool never mutates more than `costs`.
 * Trigger-free append-only is tool-layer discipline (`packages/database/CLAUDE.md`).
 */

import {
  ActivationId,
  ActivityId,
  activations,
  activities,
  assertCostReferencesSameJob,
  CommitmentId,
  Cost,
  CostInvariantError,
  CostSource,
  commitments,
  costs,
  type DatabaseClient,
  type IsoDate,
  IsoDay,
  JobId,
  Money,
  newCostId,
  PartyId,
  parties,
  ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export const RecordCostInput = z.object({
  jobId: JobId,
  scopeId: ScopeId,
  commitmentId: CommitmentId,
  activityId: ActivityId,
  activationId: ActivationId.optional(),
  counterpartyId: PartyId,
  amount: Money,
  incurredOn: IsoDay,
  source: CostSource,
  memo: z.string().optional(),
});

export const RecordCostOutput = z.object({ cost: Cost });

type RecordCostInputT = z.output<typeof RecordCostInput>;

// ---------------------------------------------------------------------------
// Validation context — rows we load once up-front and reuse for every gate.
// ---------------------------------------------------------------------------

interface LoadedContext {
  scope: { id: z.output<typeof ScopeId>; jobId: z.output<typeof JobId> };
  commitment: {
    id: z.output<typeof CommitmentId>;
    jobId: z.output<typeof JobId>;
    voidedAt: string | null;
  };
  activations: ReadonlyArray<{
    id: z.output<typeof ActivationId>;
    activityId: z.output<typeof ActivityId>;
  }>;
}

function fetchRows(db: DatabaseClient, input: RecordCostInputT) {
  return Promise.all([
    db
      .select({ id: scopes.id, jobId: scopes.jobId })
      .from(scopes)
      .where(eq(scopes.id, input.scopeId))
      .get(),
    db
      .select({
        id: commitments.id,
        jobId: commitments.jobId,
        voidedAt: commitments.voidedAt,
      })
      .from(commitments)
      .where(eq(commitments.id, input.commitmentId))
      .get(),
    db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.id, input.activityId))
      .get(),
    db
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.id, input.counterpartyId))
      .get(),
    db
      .select({ id: activations.id, activityId: activations.activityId })
      .from(activations)
      .where(eq(activations.commitmentId, input.commitmentId))
      .all(),
  ]);
}

function requirePresent<T>(
  row: T | undefined,
  message: string,
  details: Record<string, unknown>,
): T {
  if (!row) throw new McpToolError("not_found", message, details);
  return row;
}

async function loadContext(
  db: DatabaseClient,
  input: RecordCostInputT,
): Promise<LoadedContext> {
  const [scopeRow, commitmentRow, activityRow, partyRow, activationRows] =
    await fetchRows(db, input);

  requirePresent(activityRow, `activity not found: ${input.activityId}`, {
    activityId: input.activityId,
  });
  requirePresent(partyRow, `counterparty not found: ${input.counterpartyId}`, {
    counterpartyId: input.counterpartyId,
  });

  return {
    scope: requirePresent(scopeRow, `scope not found: ${input.scopeId}`, {
      scopeId: input.scopeId,
    }),
    commitment: requirePresent(
      commitmentRow,
      `commitment not found: ${input.commitmentId}`,
      { commitmentId: input.commitmentId },
    ),
    activations: activationRows,
  };
}

// ---------------------------------------------------------------------------
// Validation — pure given the loaded context.
// ---------------------------------------------------------------------------

function assertCommitmentLive(
  ctx: LoadedContext,
  commitmentId: z.output<typeof CommitmentId>,
): void {
  if (ctx.commitment.voidedAt !== null) {
    throw new McpToolError(
      "invariant_violation",
      `cannot record cost against voided commitment ${commitmentId}`,
      { commitmentId, voidedAt: ctx.commitment.voidedAt },
    );
  }
}

function assertActivityOnCommitment(
  ctx: LoadedContext,
  input: RecordCostInputT,
): void {
  const present = ctx.activations.some(
    (a) => a.activityId === input.activityId,
  );
  if (!present) {
    throw new McpToolError(
      "invariant_violation",
      `activity ${input.activityId} does not appear on any activation of commitment ${input.commitmentId}`,
      {
        activityId: input.activityId,
        commitmentId: input.commitmentId,
        commitmentActivityIds: ctx.activations.map((a) => a.activityId),
      },
    );
  }
}

function assertActivationMatches(
  ctx: LoadedContext,
  input: RecordCostInputT,
): void {
  if (input.activationId === undefined) return;
  const row = ctx.activations.find((a) => a.id === input.activationId);
  if (!row) {
    throw new McpToolError(
      "not_found",
      `activation ${input.activationId} not found on commitment ${input.commitmentId}`,
      { activationId: input.activationId, commitmentId: input.commitmentId },
    );
  }
  if (row.activityId !== input.activityId) {
    throw new McpToolError(
      "invariant_violation",
      `activation ${input.activationId} has activityId ${row.activityId}, cost references ${input.activityId}`,
      {
        activationId: input.activationId,
        activationActivityId: row.activityId,
        costActivityId: input.activityId,
      },
    );
  }
}

function assertSameJob(cost: Cost, ctx: LoadedContext): void {
  try {
    assertCostReferencesSameJob(cost, {
      scope: ctx.scope,
      commitment: { id: ctx.commitment.id, jobId: ctx.commitment.jobId },
    });
  } catch (err) {
    if (err instanceof CostInvariantError) {
      throw new McpToolError("invariant_violation", err.message, {
        code: err.code,
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Build + insert.
// ---------------------------------------------------------------------------

function buildCost(input: RecordCostInputT, recordedAt: IsoDate): Cost {
  return {
    id: newCostId(),
    jobId: input.jobId,
    scopeId: input.scopeId,
    commitmentId: input.commitmentId,
    activityId: input.activityId,
    ...(input.activationId !== undefined
      ? { activationId: input.activationId }
      : {}),
    counterpartyId: input.counterpartyId,
    amount: input.amount,
    incurredOn: input.incurredOn,
    source: input.source,
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    recordedAt,
  };
}

async function insertCost(db: DatabaseClient, cost: Cost): Promise<void> {
  await db
    .insert(costs)
    .values({
      id: cost.id,
      jobId: cost.jobId,
      scopeId: cost.scopeId,
      commitmentId: cost.commitmentId,
      activityId: cost.activityId,
      activationId: cost.activationId ?? null,
      counterpartyId: cost.counterpartyId,
      amountCents: cost.amount.cents,
      incurredOn: cost.incurredOn,
      source: cost.source,
      memo: cost.memo ?? null,
      recordedAt: cost.recordedAt,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const recordCost: McpToolDef<
  typeof RecordCostInput,
  typeof RecordCostOutput
> = {
  name: "record_cost",
  description:
    "Record a Cost against an existing Commitment. Append-only. Validates that scope + commitment belong to the Job, the commitment is not voided, the activityId appears on one of the commitment's activations, and (if activationId is provided) it belongs to the commitment and its activityId matches. Errors: not_found (scope/commitment/activity/party/activation); invariant_violation (cross-job, voided commitment, activity/activation mismatch). Returns the persisted Cost.",
  inputSchema: RecordCostInput,
  outputSchema: RecordCostOutput,
  handler: async ({ db, input }) => {
    const ctx = await loadContext(db, input);
    assertCommitmentLive(ctx, input.commitmentId);
    assertActivityOnCommitment(ctx, input);
    assertActivationMatches(ctx, input);

    const recordedAt = new Date().toISOString() as IsoDate;
    const cost = buildCost(input, recordedAt);
    assertSameJob(cost, ctx);

    await insertCost(db, cost);
    return { cost: Cost.parse(cost) };
  },
};
