/**
 * record_direct_cost — TOOLS.md §3.3, SPEC §2 Day 18.
 *
 * Shortcut for "I swiped my card at the lumberyard." SPEC §1 requires every
 * Cost reference a Commitment; when no real commitment exists, this tool
 * creates a retroactive self-commitment (lump-priced, single activation,
 * zero lead/build) AND records the Cost against it.
 *
 * Atomicity (TOOLS.md L68): the commitment + cost must land together or
 * roll back together. Two separate tool calls (`apply_patch` then
 * `record_cost`) would risk an orphaned commitment if the sequence were
 * interrupted. So this tool composes a Patch via `composePatch` from
 * `apply_patch.ts`, appends the cost insert into the returned statement
 * list, and submits one D1 batch (ADR 0008).
 *
 * `activityId` is always explicit (TOOLS.md L309). The caller picks the
 * activity — typically `materials_direct` or `labor_tm` — so that direct
 * costs roll up to the kind-of-work Claude renders in the dashboard.
 */

import {
  type ActivationId as ActivationIdT,
  ActivityId,
  activities,
  Commitment,
  type CommitmentId as CommitmentIdT,
  Cost,
  type CostId as CostIdT,
  CostSource,
  costs,
  type DatabaseClient,
  type IsoDate,
  IsoDay,
  JobId,
  Money,
  newActivationId,
  newCommitmentId,
  newCostId,
  PartyId,
  PatchId,
  parties,
  ScopeId,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";
import { composePatch, submitBatch } from "./apply_patch";

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export const RecordDirectCostInput = z.object({
  jobId: JobId,
  scopeId: ScopeId,
  activityId: ActivityId,
  counterpartyId: PartyId,
  amount: Money,
  incurredOn: IsoDay,
  source: CostSource,
  memo: z.string().optional(),
});

export const RecordDirectCostOutput = z.object({
  cost: Cost,
  commitment: Commitment,
  patchId: PatchId,
});

type RecordDirectCostInputT = z.output<typeof RecordDirectCostInput>;

interface GeneratedIds {
  commitmentId: CommitmentIdT;
  activationId: ActivationIdT;
  costId: CostIdT;
}

// ---------------------------------------------------------------------------
// Up-front FK checks. composePatch validates scope references (and scope
// cross-job); activity + counterparty aren't referenced by an edit op, so
// a clean `not_found` at the handler layer beats a batch-time SQL error.
// ---------------------------------------------------------------------------

async function assertRefsExist(
  db: DatabaseClient,
  input: RecordDirectCostInputT,
): Promise<void> {
  const [activityRow, partyRow] = await Promise.all([
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
  ]);
  if (!activityRow) {
    throw new McpToolError(
      "not_found",
      `activity not found: ${input.activityId}`,
      { activityId: input.activityId },
    );
  }
  if (!partyRow) {
    throw new McpToolError(
      "not_found",
      `counterparty not found: ${input.counterpartyId}`,
      { counterpartyId: input.counterpartyId },
    );
  }
}

// ---------------------------------------------------------------------------
// Shape builders. The self-commitment's invariants hold trivially:
// assertCommitmentPriceMatchesActivations — price.total == pricePortion;
// assertActivationScopesInCommitment — scopeIds = [scopeId] and
// activations[0].scopeId = scopeId. composePatch still runs both.
// ---------------------------------------------------------------------------

function buildSelfCommitment(
  input: RecordDirectCostInputT,
  ids: GeneratedIds,
): Commitment {
  return {
    id: ids.commitmentId,
    jobId: input.jobId,
    scopeIds: [input.scopeId],
    counterpartyId: input.counterpartyId,
    price: { kind: "lump", total: input.amount },
    activations: [
      {
        id: ids.activationId,
        activityId: input.activityId,
        scopeId: input.scopeId,
        pricePortion: input.amount,
        leadTime: { days: 0 },
        buildTime: { days: 0 },
      },
    ],
    signedOn: input.incurredOn,
  };
}

function buildDirectCost(
  input: RecordDirectCostInputT,
  ids: GeneratedIds,
  recordedAt: IsoDate,
): Cost {
  return {
    id: ids.costId,
    jobId: input.jobId,
    scopeId: input.scopeId,
    commitmentId: ids.commitmentId,
    activityId: input.activityId,
    activationId: ids.activationId,
    counterpartyId: input.counterpartyId,
    amount: input.amount,
    incurredOn: input.incurredOn,
    source: input.source,
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    recordedAt,
  };
}

function costInsertStmt(db: DatabaseClient, cost: Cost): unknown {
  return db.insert(costs).values({
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
  });
}

function patchMessage(input: RecordDirectCostInputT): string {
  return `direct cost: ${input.source.kind}${
    input.memo ? ` — ${input.memo}` : ""
  }`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const recordDirectCost: McpToolDef<
  typeof RecordDirectCostInput,
  typeof RecordDirectCostOutput
> = {
  name: "record_direct_cost",
  description:
    "Record a Cost with no pre-existing Commitment (Day-18 'swiped my card at the lumberyard'). Atomically creates a self-commitment (lump-priced, single activation, zero lead/build) via apply_patch and records the Cost against it in one D1 batch — no orphaned commitment on partial failure. Caller passes activityId explicitly (typically materials_direct or labor_tm). Errors: not_found (scope/activity/counterparty); invariant_violation (scope cross-job). Returns { cost, commitment, patchId }.",
  inputSchema: RecordDirectCostInput,
  outputSchema: RecordDirectCostOutput,
  handler: async ({ db, input }) => {
    await assertRefsExist(db, input);

    const ids: GeneratedIds = {
      commitmentId: newCommitmentId(),
      activationId: newActivationId(),
      costId: newCostId(),
    };
    const commitment = buildSelfCommitment(input, ids);

    const { patch, stmts } = await composePatch(db, {
      jobId: input.jobId,
      message: patchMessage(input),
      edits: [{ op: "create", commitment }],
    });

    const recordedAt = new Date().toISOString() as IsoDate;
    const cost = buildDirectCost(input, ids, recordedAt);

    // One batch, all-or-nothing. If the cost insert fails (PK collision,
    // FK violation), the patch + commitment + activation + junction inserts
    // all roll back. No orphaned commitment.
    await submitBatch(db, [...stmts, costInsertStmt(db, cost)]);

    return {
      cost: Cost.parse(cost),
      commitment: Commitment.parse(commitment),
      patchId: patch.id,
    };
  },
};
