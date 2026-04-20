/**
 * cost_entry_form — label resolver.
 *
 * Pure function over a DatabaseClient: takes the (partial) pre-fill input the
 * caller supplied and resolves display labels for each ID that's present.
 * The `cost_entry_form` app tool calls this to build the `structuredContent`
 * the view consumes; the text-only fallback tool uses the same resolved shape
 * to format a suggestion for `record_cost`.
 *
 * Shape rules (per the slice spec):
 *   - jobId is always provided → jobName is always in the output.
 *   - Every other ID is optional → if the input omits it, the paired label is
 *     omitted from the output. Don't fabricate labels for IDs the caller
 *     didn't supply.
 *   - Unknown IDs (queried but absent from D1) → throw McpToolError("not_found").
 *
 * Commitments carry no `name` column in SPEC §1, so the natural label is the
 * commitment's counterparty's Party.name. That requires a second lookup
 * after the commitment row comes back — kept separate from the batched
 * initial fetch to keep the pure-function shape straightforward.
 */

import {
  ActivityId,
  activities,
  CommitmentId,
  commitments,
  type DatabaseClient,
  IsoDay,
  JobId,
  jobs,
  Money,
  PartyId,
  parties,
  ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { McpToolError } from "./_mcp-tool";

// ---------------------------------------------------------------------------
// Input schema — exported so the tool registration can feed it to
// `registerAppTool`/`registerTool` as the tool's inputSchema.
// ---------------------------------------------------------------------------

export const CostEntryFormInput = z.object({
  jobId: JobId,
  scopeId: ScopeId.optional(),
  commitmentId: CommitmentId.optional(),
  activityId: ActivityId.optional(),
  counterpartyId: PartyId.optional(),
  amount: Money.optional(),
  incurredOn: IsoDay.optional(),
  memo: z.string().optional(),
});
export type CostEntryFormInput = z.output<typeof CostEntryFormInput>;

// ---------------------------------------------------------------------------
// Output shape — the resolved pre-fill context. Serialized as-is into the
// app tool's `structuredContent`.
// ---------------------------------------------------------------------------

export interface CostEntryFormContext {
  jobId: z.output<typeof JobId>;
  jobName: string;
  scopeId?: z.output<typeof ScopeId>;
  scopeName?: string;
  commitmentId?: z.output<typeof CommitmentId>;
  commitmentLabel?: string;
  activityId?: z.output<typeof ActivityId>;
  activityName?: string;
  counterpartyId?: z.output<typeof PartyId>;
  counterpartyName?: string;
  amount?: z.output<typeof Money>;
  incurredOn?: z.output<typeof IsoDay>;
  memo?: string;
}

// ---------------------------------------------------------------------------
// Batched initial fetch
// ---------------------------------------------------------------------------

interface FetchedRows {
  job: { id: z.output<typeof JobId>; name: string } | undefined;
  scope: { id: z.output<typeof ScopeId>; name: string } | undefined;
  commitment:
    | {
        id: z.output<typeof CommitmentId>;
        counterpartyId: z.output<typeof PartyId>;
      }
    | undefined;
  activity: { id: z.output<typeof ActivityId>; name: string } | undefined;
  party: { id: z.output<typeof PartyId>; name: string } | undefined;
}

function fetchRows(
  db: DatabaseClient,
  input: CostEntryFormInput,
): Promise<FetchedRows> {
  const scopeQ =
    input.scopeId !== undefined
      ? db
          .select({ id: scopes.id, name: scopes.name })
          .from(scopes)
          .where(eq(scopes.id, input.scopeId))
          .get()
      : Promise.resolve(undefined);
  const commitmentQ =
    input.commitmentId !== undefined
      ? db
          .select({
            id: commitments.id,
            counterpartyId: commitments.counterpartyId,
          })
          .from(commitments)
          .where(eq(commitments.id, input.commitmentId))
          .get()
      : Promise.resolve(undefined);
  const activityQ =
    input.activityId !== undefined
      ? db
          .select({ id: activities.id, name: activities.name })
          .from(activities)
          .where(eq(activities.id, input.activityId))
          .get()
      : Promise.resolve(undefined);
  const partyQ =
    input.counterpartyId !== undefined
      ? db
          .select({ id: parties.id, name: parties.name })
          .from(parties)
          .where(eq(parties.id, input.counterpartyId))
          .get()
      : Promise.resolve(undefined);

  return Promise.all([
    db
      .select({ id: jobs.id, name: jobs.name })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .get(),
    scopeQ,
    commitmentQ,
    activityQ,
    partyQ,
  ]).then(([job, scope, commitment, activity, party]) => ({
    job,
    scope,
    commitment,
    activity,
    party,
  }));
}

// ---------------------------------------------------------------------------
// Found-row assertions — one call maps one potentially-missing row to a
// `not_found` McpToolError with structured details.
// ---------------------------------------------------------------------------

// Pure assertion — callers discard the return, so don't pretend to return
// one. We can't use `asserts row is NonNullable<T>` here because the
// "absent is OK" case is gated on `requestedId === undefined`, which TS's
// assertion-signature grammar can't express as a conjunction. Downstream
// code narrows via `if (rows.scope)` etc. in buildContext.
function requireFound<T>(
  row: T | undefined,
  requestedId: string | undefined,
  label: string,
  detailsKey: string,
): void {
  if (requestedId === undefined) return;
  if (row === undefined) {
    throw new McpToolError("not_found", `${label} not found: ${requestedId}`, {
      [detailsKey]: requestedId,
    });
  }
}

function assertJobFound(
  row: FetchedRows["job"],
  jobId: z.output<typeof JobId>,
): asserts row is NonNullable<FetchedRows["job"]> {
  if (!row) {
    throw new McpToolError("not_found", `job not found: ${jobId}`, { jobId });
  }
}

// ---------------------------------------------------------------------------
// commitmentLabel ← Party.name(commitment.counterpartyId)
//
// M3 decision: bare counterparty name is the label. Ambiguity risk (two
// commitments from one counterparty on a job) is tracked in
// docs/product/backlog.md under "Data model / schema" and gets revisited
// if dogfood surfaces a collision.
// ---------------------------------------------------------------------------

async function resolveCommitmentLabel(
  db: DatabaseClient,
  commitment: NonNullable<FetchedRows["commitment"]>,
): Promise<string> {
  const row = await db
    .select({ name: parties.name })
    .from(parties)
    .where(eq(parties.id, commitment.counterpartyId))
    .get();
  if (!row) {
    throw new McpToolError(
      "not_found",
      `commitment ${commitment.id} references missing counterparty ${commitment.counterpartyId}`,
      {
        commitmentId: commitment.id,
        counterpartyId: commitment.counterpartyId,
      },
    );
  }
  return row.name;
}

// ---------------------------------------------------------------------------
// Assemble output from the (already-validated) rows + pass-through scalars.
// ---------------------------------------------------------------------------

function applyRowLabels(
  out: CostEntryFormContext,
  rows: FetchedRows,
  commitmentLabel: string | undefined,
): void {
  if (rows.scope) {
    out.scopeId = rows.scope.id;
    out.scopeName = rows.scope.name;
  }
  // Caller invariant: if rows.commitment is set, commitmentLabel is set too
  // (resolveCommitmentLabel is awaited only when rows.commitment exists).
  if (rows.commitment) {
    out.commitmentId = rows.commitment.id;
    out.commitmentLabel = commitmentLabel;
  }
  if (rows.activity) {
    out.activityId = rows.activity.id;
    out.activityName = rows.activity.name;
  }
  if (rows.party) {
    out.counterpartyId = rows.party.id;
    out.counterpartyName = rows.party.name;
  }
}

function applyInputScalars(
  out: CostEntryFormContext,
  input: CostEntryFormInput,
): void {
  if (input.amount !== undefined) out.amount = input.amount;
  if (input.incurredOn !== undefined) out.incurredOn = input.incurredOn;
  if (input.memo !== undefined) out.memo = input.memo;
}

function buildContext(
  rows: FetchedRows,
  input: CostEntryFormInput,
  commitmentLabel: string | undefined,
): CostEntryFormContext {
  if (!rows.job) throw new Error("unreachable: job asserted present");
  const out: CostEntryFormContext = {
    jobId: rows.job.id,
    jobName: rows.job.name,
  };
  applyRowLabels(out, rows, commitmentLabel);
  applyInputScalars(out, input);
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function resolveCostEntryFormContext(
  db: DatabaseClient,
  input: CostEntryFormInput,
): Promise<CostEntryFormContext> {
  const rows = await fetchRows(db, input);

  assertJobFound(rows.job, input.jobId);
  requireFound(rows.scope, input.scopeId, "scope", "scopeId");
  requireFound(
    rows.commitment,
    input.commitmentId,
    "commitment",
    "commitmentId",
  );
  requireFound(rows.activity, input.activityId, "activity", "activityId");
  requireFound(
    rows.party,
    input.counterpartyId,
    "counterparty",
    "counterpartyId",
  );

  const commitmentLabel =
    rows.commitment !== undefined
      ? await resolveCommitmentLabel(db, rows.commitment)
      : undefined;

  return buildContext(rows, input, commitmentLabel);
}
