/**
 * apply_patch — TOOLS.md §3.2; ADRs 0005–0009.
 *
 * The sole commitment-mutation API. Every commitment edit (create, setPrice,
 * addActivation, setActivation, removeActivation, void) flows through here
 * so the normalized projection (`commitments` / `activations` /
 * `commitment_scopes`) and the append-only patches log stay in lock-step.
 *
 * Handler flow (ADR 0008):
 *
 *   1. Collect every commitmentId / scopeId / activationId referenced by the
 *      incoming edits so we can read current state in two round-trips rather
 *      than per edit.
 *   2. Load current commitment state (rows + activations + scope junctions +
 *      voided_at projection column per ADR 0009) from D1.
 *   3. Run handler-layer gates that SQL can't express: cross-job scope
 *      references; commitment exists + belongs to job + not voided;
 *      removeActivation with outstanding NTPs (F1.3); parent patch exists +
 *      jobId matches.
 *   4. Fold edits sequentially. Each op mutates the in-memory fold state and
 *      emits its D1 projection statements (INSERT / UPDATE / DELETE) into a
 *      single list. The two halves stay co-located in one switch arm so a
 *      future op addition can't drift fold state from projection SQL.
 *   5. Run post-fold invariants (`assertCommitmentPriceMatchesActivations`
 *      + `assertActivationScopesInCommitment`) against every touched
 *      commitment. Checks are against final state, not intermediate — a
 *      multi-edit patch can legitimately pass through invariant-violating
 *      interim shapes.
 *   6. Content-address the patch (`patchIdFor` — jobId + parentPatchId + edits
 *      + createdAt) and batch the patch row + all projection mutations as
 *      one D1 `db.batch([...])` call. The pre-fold validation means any
 *      runtime batch failure is a schema / constraint bug, not invariant
 *      drift.
 *
 * Void is projected via `commitments.voided_at` + `voided_reason` (ADR 0009),
 * not derived from the patches log. Voided commitments reject any further
 * edit (including another void).
 */

import {
  type Activation,
  type ActivationId as ActivationIdT,
  activations,
  assertActivationScopesInCommitment,
  assertCommitmentPriceMatchesActivations,
  type Commitment,
  CommitmentEdit,
  type CommitmentId as CommitmentIdT,
  CommitmentInvariantError,
  commitmentScopes,
  commitments,
  type DatabaseClient,
  type IsoDate,
  JobId,
  ntpEvents,
  Patch,
  PatchId,
  type PatchId as PatchIdT,
  patches,
  patchIdFor,
  type ScopeId as ScopeIdT,
  scopes,
  type Throughput,
} from "@gc-erp/database";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export const ApplyPatchInput = z.object({
  jobId: JobId,
  parentPatchId: PatchId.optional(),
  message: z.string(),
  edits: z.array(CommitmentEdit).min(1),
});

export const ApplyPatchOutput = z.object({ patch: Patch });

// ---------------------------------------------------------------------------
// Loaded-state shape
// ---------------------------------------------------------------------------

/**
 * A commitment reconstructed from the projection tables plus its projection-
 * only void state (ADR 0009). Fold state is keyed on the SPEC `Commitment`
 * shape — `voidedAt`/`voidedReason` ride alongside rather than on the shape
 * itself, so the Zod contract stays intact when a caller reads the row.
 */
interface FoldEntry {
  commitment: Commitment;
  voidedAt?: IsoDate;
  voidedReason?: string;
  /** True iff the entry was introduced by a `create` op in this patch. */
  created: boolean;
}

type ActivationRow = typeof activations.$inferSelect;
type CommitmentRow = typeof commitments.$inferSelect;
type ScopeJunctionRow = typeof commitmentScopes.$inferSelect;

function rowToActivation(row: ActivationRow): Activation {
  return {
    id: row.id,
    activityId: row.activityId,
    scopeId: row.scopeId,
    pricePortion: { cents: row.pricePortionCents, currency: "USD" },
    leadTime: { days: row.leadTimeDays },
    buildTime: { days: row.buildTimeDays },
    ...(row.throughput ? { throughput: row.throughput as Throughput } : {}),
  };
}

function buildFoldEntry(
  row: CommitmentRow,
  activationsForRow: ActivationRow[],
  junctionForRow: ScopeJunctionRow[],
): FoldEntry {
  const commitment: Commitment = {
    id: row.id,
    jobId: row.jobId,
    scopeIds: junctionForRow.map((j) => j.scopeId),
    counterpartyId: row.counterpartyId,
    price: row.price,
    activations: activationsForRow.map(rowToActivation),
    ...(row.signedOn ? { signedOn: row.signedOn } : {}),
  };
  return {
    commitment,
    ...(row.voidedAt ? { voidedAt: row.voidedAt as IsoDate } : {}),
    ...(row.voidedReason ? { voidedReason: row.voidedReason } : {}),
    created: false,
  };
}

// ---------------------------------------------------------------------------
// Per-op fold + SQL emission
//
// Each op keeps its fold mutation and its projection statements in one
// section so the two halves can't drift. `ctx.stmts` is the batch list the
// handler submits at the end; each function appends what its op needs.
// ---------------------------------------------------------------------------

interface EditCtx {
  db: DatabaseClient;
  jobId: z.output<typeof JobId>;
  createdAt: IsoDate;
  fold: Map<CommitmentIdT, FoldEntry>;
  /**
   * Accumulated projection statements, in submit order. Drizzle query
   * builders are `RunnableQuery<_, 'sqlite'>` and satisfy `BatchItem`; the
   * handler submits them via `db.batch([...])`.
   */
  stmts: unknown[];
}

function requireAlive(
  ctx: EditCtx,
  commitmentId: CommitmentIdT,
  op: string,
): FoldEntry {
  const entry = ctx.fold.get(commitmentId);
  if (!entry) {
    throw new McpToolError(
      "not_found",
      `cannot ${op} nonexistent commitment ${commitmentId}`,
      { commitmentId, op },
    );
  }
  if (entry.voidedAt) {
    throw new McpToolError(
      "invariant_violation",
      `cannot ${op} voided commitment ${commitmentId}`,
      { commitmentId, op, voidedAt: entry.voidedAt },
    );
  }
  return entry;
}

function applyCreate(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "create" }>,
): void {
  const { commitment } = edit;
  if (ctx.fold.has(commitment.id)) {
    throw new McpToolError(
      "invariant_violation",
      `commitment ${commitment.id} already exists`,
      { commitmentId: commitment.id },
    );
  }
  if (commitment.jobId !== ctx.jobId) {
    throw new McpToolError(
      "invariant_violation",
      `create commitment.jobId (${commitment.jobId}) does not match patch.jobId (${ctx.jobId})`,
      {
        commitmentId: commitment.id,
        commitmentJobId: commitment.jobId,
        patchJobId: ctx.jobId,
      },
    );
  }
  ctx.fold.set(commitment.id, { commitment, created: true });

  ctx.stmts.push(
    ctx.db.insert(commitments).values({
      id: commitment.id,
      jobId: commitment.jobId,
      counterpartyId: commitment.counterpartyId,
      price: commitment.price,
      signedOn: commitment.signedOn ?? null,
    }),
    ctx.db.insert(activations).values(
      commitment.activations.map((a) => ({
        id: a.id,
        commitmentId: commitment.id,
        activityId: a.activityId,
        scopeId: a.scopeId,
        pricePortionCents: a.pricePortion.cents,
        leadTimeDays: a.leadTime.days,
        buildTimeDays: a.buildTime.days,
        throughput: a.throughput ?? null,
      })),
    ),
    ctx.db.insert(commitmentScopes).values(
      commitment.scopeIds.map((scopeId) => ({
        commitmentId: commitment.id,
        scopeId,
      })),
    ),
  );
}

function applySetPrice(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "setPrice" }>,
): void {
  const entry = requireAlive(ctx, edit.commitmentId, "setPrice");
  entry.commitment = { ...entry.commitment, price: edit.price };
  ctx.stmts.push(
    ctx.db
      .update(commitments)
      .set({ price: edit.price })
      .where(eq(commitments.id, edit.commitmentId)),
  );
}

function applyAddActivation(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "addActivation" }>,
): void {
  const entry = requireAlive(ctx, edit.commitmentId, "addActivation");
  if (entry.commitment.activations.some((a) => a.id === edit.activation.id)) {
    throw new McpToolError(
      "invariant_violation",
      `activation ${edit.activation.id} already exists on commitment ${edit.commitmentId}`,
      { commitmentId: edit.commitmentId, activationId: edit.activation.id },
    );
  }
  entry.commitment = {
    ...entry.commitment,
    activations: [...entry.commitment.activations, edit.activation],
  };
  ctx.stmts.push(
    ctx.db.insert(activations).values({
      id: edit.activation.id,
      commitmentId: edit.commitmentId,
      activityId: edit.activation.activityId,
      scopeId: edit.activation.scopeId,
      pricePortionCents: edit.activation.pricePortion.cents,
      leadTimeDays: edit.activation.leadTime.days,
      buildTimeDays: edit.activation.buildTime.days,
      throughput: edit.activation.throughput ?? null,
    }),
  );
}

/**
 * Projects a partial `setActivation.fields` onto the in-memory `Activation`
 * and the corresponding `activations` column update set. The two sides
 * must stay in lock-step: the fold drives post-fold invariants, the update
 * drives the projection SQL. Keeping them in one table here makes drift
 * mechanical rather than conceptual.
 */
function projectSetActivationFields(
  prev: Activation,
  fields: Extract<CommitmentEdit, { op: "setActivation" }>["fields"],
): { merged: Activation; update: Partial<typeof activations.$inferInsert> } {
  const merged: Activation = { ...prev };
  const update: Partial<typeof activations.$inferInsert> = {};
  if (fields.scopeId !== undefined) {
    merged.scopeId = fields.scopeId;
    update.scopeId = fields.scopeId;
  }
  if (fields.pricePortion !== undefined) {
    merged.pricePortion = fields.pricePortion;
    update.pricePortionCents = fields.pricePortion.cents;
  }
  if (fields.leadTime !== undefined) {
    merged.leadTime = fields.leadTime;
    update.leadTimeDays = fields.leadTime.days;
  }
  if (fields.buildTime !== undefined) {
    merged.buildTime = fields.buildTime;
    update.buildTimeDays = fields.buildTime.days;
  }
  if (fields.throughput !== undefined) {
    merged.throughput = fields.throughput;
    update.throughput = fields.throughput;
  }
  return { merged, update };
}

function applySetActivation(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "setActivation" }>,
): void {
  const entry = requireAlive(ctx, edit.commitmentId, "setActivation");
  const idx = entry.commitment.activations.findIndex(
    (a) => a.id === edit.activationId,
  );
  if (idx < 0) {
    throw new McpToolError(
      "not_found",
      `activation ${edit.activationId} not found on commitment ${edit.commitmentId}`,
      { commitmentId: edit.commitmentId, activationId: edit.activationId },
    );
  }
  const { merged, update } = projectSetActivationFields(
    entry.commitment.activations[idx],
    edit.fields,
  );
  const nextActivations = [...entry.commitment.activations];
  nextActivations[idx] = merged;
  entry.commitment = { ...entry.commitment, activations: nextActivations };

  if (Object.keys(update).length > 0) {
    ctx.stmts.push(
      ctx.db
        .update(activations)
        .set(update)
        .where(eq(activations.id, edit.activationId)),
    );
  }
}

function applyRemoveActivation(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "removeActivation" }>,
): void {
  const entry = requireAlive(ctx, edit.commitmentId, "removeActivation");
  const idx = entry.commitment.activations.findIndex(
    (a) => a.id === edit.activationId,
  );
  if (idx < 0) {
    throw new McpToolError(
      "not_found",
      `activation ${edit.activationId} not found on commitment ${edit.commitmentId}`,
      { commitmentId: edit.commitmentId, activationId: edit.activationId },
    );
  }
  entry.commitment = {
    ...entry.commitment,
    activations: entry.commitment.activations.filter((_, i) => i !== idx),
  };
  ctx.stmts.push(
    ctx.db.delete(activations).where(eq(activations.id, edit.activationId)),
  );
}

function applyVoid(
  ctx: EditCtx,
  edit: Extract<CommitmentEdit, { op: "void" }>,
): void {
  const entry = ctx.fold.get(edit.commitmentId);
  if (!entry) {
    throw new McpToolError(
      "not_found",
      `cannot void nonexistent commitment ${edit.commitmentId}`,
      { commitmentId: edit.commitmentId },
    );
  }
  if (entry.voidedAt) {
    throw new McpToolError(
      "invariant_violation",
      `commitment ${edit.commitmentId} is already voided`,
      { commitmentId: edit.commitmentId, voidedAt: entry.voidedAt },
    );
  }
  entry.voidedAt = ctx.createdAt;
  entry.voidedReason = edit.reason;
  ctx.stmts.push(
    ctx.db
      .update(commitments)
      .set({ voidedAt: ctx.createdAt, voidedReason: edit.reason })
      .where(eq(commitments.id, edit.commitmentId)),
  );
}

// ---------------------------------------------------------------------------
// Handler phases — each lifted out so the handler itself is readable end-to-
// end orchestration. Order mirrors the handler docstring's numbered flow.
// ---------------------------------------------------------------------------

interface Refs {
  commitmentIdsToLoad: Set<CommitmentIdT>;
  scopeIdsRefd: Set<ScopeIdT>;
  activationIdsToCheckForNtp: Set<ActivationIdT>;
}

function collectReferences(edits: readonly CommitmentEdit[]): Refs {
  const refs: Refs = {
    commitmentIdsToLoad: new Set(),
    scopeIdsRefd: new Set(),
    activationIdsToCheckForNtp: new Set(),
  };
  for (const edit of edits) {
    switch (edit.op) {
      case "create":
        for (const s of edit.commitment.scopeIds) refs.scopeIdsRefd.add(s);
        for (const a of edit.commitment.activations)
          refs.scopeIdsRefd.add(a.scopeId);
        break;
      case "addActivation":
        refs.commitmentIdsToLoad.add(edit.commitmentId);
        refs.scopeIdsRefd.add(edit.activation.scopeId);
        break;
      case "setActivation":
        refs.commitmentIdsToLoad.add(edit.commitmentId);
        if (edit.fields.scopeId !== undefined)
          refs.scopeIdsRefd.add(edit.fields.scopeId);
        break;
      case "removeActivation":
        refs.commitmentIdsToLoad.add(edit.commitmentId);
        refs.activationIdsToCheckForNtp.add(edit.activationId);
        break;
      case "setPrice":
      case "void":
        refs.commitmentIdsToLoad.add(edit.commitmentId);
        break;
    }
  }
  return refs;
}

async function validateParentPatch(
  db: DatabaseClient,
  parentPatchId: PatchIdT,
  jobId: z.output<typeof JobId>,
): Promise<void> {
  const parent = await db
    .select({ jobId: patches.jobId })
    .from(patches)
    .where(eq(patches.id, parentPatchId))
    .get();
  if (!parent) {
    throw new McpToolError(
      "not_found",
      `parent patch not found: ${parentPatchId}`,
      { parentPatchId },
    );
  }
  if (parent.jobId !== jobId) {
    throw new McpToolError(
      "invariant_violation",
      `parent patch ${parentPatchId} belongs to job ${parent.jobId}, not ${jobId}`,
      { parentPatchId, parentJobId: parent.jobId, patchJobId: jobId },
    );
  }
}

async function loadCommitmentState(
  db: DatabaseClient,
  ids: readonly CommitmentIdT[],
): Promise<Map<CommitmentIdT, FoldEntry>> {
  const loaded = new Map<CommitmentIdT, FoldEntry>();
  if (ids.length === 0) return loaded;
  const [commRows, actRows, junctionRows] = await Promise.all([
    db.select().from(commitments).where(inArray(commitments.id, ids)).all(),
    db
      .select()
      .from(activations)
      .where(inArray(activations.commitmentId, ids))
      .all(),
    db
      .select()
      .from(commitmentScopes)
      .where(inArray(commitmentScopes.commitmentId, ids))
      .all(),
  ]);
  for (const row of commRows) {
    loaded.set(
      row.id,
      buildFoldEntry(
        row,
        actRows.filter((a) => a.commitmentId === row.id),
        junctionRows.filter((j) => j.commitmentId === row.id),
      ),
    );
  }
  return loaded;
}

async function validateScopeReferences(
  db: DatabaseClient,
  scopeIdsRefd: ReadonlySet<ScopeIdT>,
  jobId: z.output<typeof JobId>,
): Promise<void> {
  if (scopeIdsRefd.size === 0) return;
  const scopeRows = await db
    .select({ id: scopes.id, jobId: scopes.jobId })
    .from(scopes)
    .where(inArray(scopes.id, [...scopeIdsRefd]))
    .all();
  const byId = new Map(scopeRows.map((s) => [s.id, s.jobId]));
  for (const sid of scopeIdsRefd) {
    const sjob = byId.get(sid);
    if (!sjob) {
      throw new McpToolError("not_found", `scope not found: ${sid}`, {
        scopeId: sid,
      });
    }
    if (sjob !== jobId) {
      throw new McpToolError(
        "invariant_violation",
        `scope ${sid} belongs to job ${sjob}, not ${jobId}`,
        { scopeId: sid, scopeJobId: sjob, patchJobId: jobId },
      );
    }
  }
}

function validateLoadedCommitments(
  loaded: Map<CommitmentIdT, FoldEntry>,
  commitmentIdsToLoad: ReadonlySet<CommitmentIdT>,
  jobId: z.output<typeof JobId>,
): void {
  for (const cid of commitmentIdsToLoad) {
    const entry = loaded.get(cid);
    if (!entry) {
      throw new McpToolError("not_found", `commitment not found: ${cid}`, {
        commitmentId: cid,
      });
    }
    if (entry.commitment.jobId !== jobId) {
      throw new McpToolError(
        "invariant_violation",
        `commitment ${cid} belongs to job ${entry.commitment.jobId}, not ${jobId}`,
        {
          commitmentId: cid,
          commitmentJobId: entry.commitment.jobId,
          patchJobId: jobId,
        },
      );
    }
  }
}

async function validateNoNtpsForRemoval(
  db: DatabaseClient,
  activationIds: ReadonlySet<ActivationIdT>,
): Promise<void> {
  if (activationIds.size === 0) return;
  const ntps = await db
    .select({ activationId: ntpEvents.activationId })
    .from(ntpEvents)
    .where(inArray(ntpEvents.activationId, [...activationIds]))
    .all();
  if (ntps.length === 0) return;
  const blocked = new Set(ntps.map((n) => n.activationId));
  const bad = [...activationIds].find((a) => blocked.has(a));
  if (bad) {
    throw new McpToolError(
      "invariant_violation",
      `cannot removeActivation ${bad}: outstanding NTP events exist`,
      { activationId: bad },
    );
  }
}

function foldEdits(ctx: EditCtx, edits: readonly CommitmentEdit[]): void {
  for (const edit of edits) {
    switch (edit.op) {
      case "create":
        applyCreate(ctx, edit);
        break;
      case "setPrice":
        applySetPrice(ctx, edit);
        break;
      case "addActivation":
        applyAddActivation(ctx, edit);
        break;
      case "setActivation":
        applySetActivation(ctx, edit);
        break;
      case "removeActivation":
        applyRemoveActivation(ctx, edit);
        break;
      case "void":
        applyVoid(ctx, edit);
        break;
    }
  }
}

function checkEntryInvariants(entry: FoldEntry): void {
  // Zod enforces `activations.min(1)` on the Commitment shape; a
  // removeActivation that empties a non-voided commitment would violate
  // that after the fold — catch explicitly so the error surface is a
  // handler-layer invariant, not a Zod parse failure at read time.
  if (entry.commitment.activations.length === 0) {
    if (!entry.voidedAt) {
      throw new McpToolError(
        "invariant_violation",
        `commitment ${entry.commitment.id} has no activations after fold`,
        { commitmentId: entry.commitment.id },
      );
    }
    return;
  }
  try {
    assertCommitmentPriceMatchesActivations(entry.commitment);
    assertActivationScopesInCommitment(entry.commitment);
  } catch (err) {
    if (err instanceof CommitmentInvariantError) {
      throw new McpToolError("invariant_violation", err.message, {
        code: err.code,
        ...err.details,
      });
    }
    throw err;
  }
}

function validatePostFoldInvariants(
  fold: ReadonlyMap<CommitmentIdT, FoldEntry>,
): void {
  for (const [, entry] of fold) checkEntryInvariants(entry);
}

/**
 * Submit the batched write. Drizzle's D1 adapter exposes `.batch([...])`
 * natively; our test harness polyfills the same shape over a better-sqlite3
 * BEGIN/COMMIT (`_test-db.ts`) so both runtimes honor all-or-nothing
 * semantics per ADR 0008. The cast crosses the driver-shape gap.
 *
 * Exported so sibling tools that extend an `apply_patch` batch with their
 * own writes (`record_direct_cost` appends a cost insert) submit through the
 * same primitive — keeps the atomicity boundary in one place.
 */
export async function submitBatch(
  db: DatabaseClient,
  stmts: readonly unknown[],
): Promise<void> {
  const batchable = db as unknown as {
    batch: (qs: readonly unknown[]) => Promise<unknown[]>;
  };
  await batchable.batch(stmts);
}

// ---------------------------------------------------------------------------
// composePatch — everything up to, but not including, the batch submit.
//
// Exported so `record_direct_cost` can build a patch that creates a
// self-commitment *and* append its cost insert into the same D1 batch per
// TOOLS.md §3.3's atomicity requirement. Callers that are just applying a
// patch (the canonical `apply_patch` path) use the handler below, which is
// now a thin composition of this + `submitBatch`.
// ---------------------------------------------------------------------------

export interface ComposedPatch {
  /** The persisted Patch object — parsed, ready to return. */
  patch: Patch;
  /**
   * Ordered batch statements: `[patchInsert, ...projectionStmts]`. Callers
   * append their own statements and submit via {@link submitBatch} so the
   * whole thing lands atomically (ADR 0008).
   */
  stmts: unknown[];
}

export async function composePatch(
  db: DatabaseClient,
  input: z.output<typeof ApplyPatchInput>,
): Promise<ComposedPatch> {
  const { jobId, parentPatchId, message, edits } = input;
  const createdAt = new Date().toISOString() as IsoDate;

  const refs = collectReferences(edits);

  if (parentPatchId !== undefined) {
    await validateParentPatch(db, parentPatchId, jobId);
  }

  const loaded = await loadCommitmentState(db, [...refs.commitmentIdsToLoad]);
  await validateScopeReferences(db, refs.scopeIdsRefd, jobId);
  validateLoadedCommitments(loaded, refs.commitmentIdsToLoad, jobId);
  await validateNoNtpsForRemoval(db, refs.activationIdsToCheckForNtp);

  const ctx: EditCtx = {
    db,
    jobId,
    createdAt,
    fold: new Map(loaded),
    stmts: [],
  };
  foldEdits(ctx, edits);
  validatePostFoldInvariants(ctx.fold);

  const patchId = (await patchIdFor({
    jobId,
    ...(parentPatchId !== undefined ? { parentPatchId } : {}),
    edits,
    createdAt,
  })) as PatchIdT;

  const patchInsertStmt = db.insert(patches).values({
    id: patchId,
    parentPatchId: parentPatchId ?? null,
    jobId,
    author: null,
    message,
    createdAt,
    edits: [...edits],
  });

  const patch: Patch = Patch.parse({
    id: patchId,
    jobId,
    message,
    createdAt,
    edits,
    ...(parentPatchId !== undefined ? { parentPatchId } : {}),
  });

  return { patch, stmts: [patchInsertStmt, ...ctx.stmts] };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const applyPatch: McpToolDef<
  typeof ApplyPatchInput,
  typeof ApplyPatchOutput
> = {
  name: "apply_patch",
  description:
    "Apply a Patch — one or more CommitmentEdits (create, setPrice, addActivation, setActivation, removeActivation, void) — atomically against a Job's commitment state. Single D1 batch; post-fold invariants; content-addressed patch id. Errors: not_found (referenced commitment/activation/scope missing); invariant_violation (cross-job scope, voided commitment edit, price/scope mismatch post-fold, outstanding NTPs on removeActivation). Returns the persisted Patch.",
  inputSchema: ApplyPatchInput,
  outputSchema: ApplyPatchOutput,
  handler: async ({ db, input }) => {
    const { patch, stmts } = await composePatch(db, input);
    await submitBatch(db, stmts);
    return { patch };
  },
};
