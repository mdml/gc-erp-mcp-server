/**
 * Fold a patch chain into the projected commitment state — SPEC §1's
 * "current state = fold(patches)" as a pure function.
 *
 * Mirrors the in-handler fold inside `apply_patch` but starts from empty
 * state and operates on raw `Patch[]` instead of a loaded projection. The
 * canonical use is [ADR 0008 §F3.2](../../../../docs/decisions/0008-apply-patch-atomicity-via-d1-batch.md)'s
 * parity check: fold every patch for a job, compare the result to what the
 * `commitments` / `activations` / `commitment_scopes` tables actually say.
 * Divergence is a projection-drift bug.
 *
 * Invariants are *not* re-checked here. `apply_patch` is the write path
 * that gates invariants pre-batch (§F1.5); a fold consumer is by
 * construction reading history that was already accepted. Re-running
 * invariant validators during the fold would couple the reader to rules
 * that can evolve (ADR 0006 void semantics, ADR 0009 projected columns).
 *
 * Void state surfaces via `voidedAt` / `voidedReason` on the folded entry
 * (not on the `Commitment` shape — SPEC keeps those separate per ADR 0009).
 * Consumers that mimic the `commitments.voidedAt IS NULL` rollup filter
 * from `get_scope_tree` can read the field directly.
 */

import type { Activation, Commitment, PriceKind } from "../schema/commitments";
import type { IsoDate } from "../schema/common";
import type { CommitmentId } from "../schema/ids";
import type { CommitmentEdit, Patch } from "../schema/patches";

export interface FoldedCommitment {
  commitment: Commitment;
  voidedAt?: IsoDate;
  voidedReason?: string;
}

export type FoldMap = Map<CommitmentId, FoldedCommitment>;

// ---------------------------------------------------------------------------
// Per-op fold. Each op is a pure mutator on the FoldMap. Mirrors the shape
// of `apply_patch`'s handler-side fold — keeping them 1:1 per op makes it
// mechanical to notice drift if either side gains logic the other doesn't.
// `withEntry` factors out the "look up the commitment or bail" prefix all
// non-create ops share.
// ---------------------------------------------------------------------------

function withEntry(
  fold: FoldMap,
  commitmentId: CommitmentId,
  mutate: (entry: FoldedCommitment) => void,
): void {
  const entry = fold.get(commitmentId);
  if (entry) mutate(entry);
}

function mutateActivations(
  fold: FoldMap,
  commitmentId: CommitmentId,
  fn: (prev: readonly Activation[]) => Activation[],
): void {
  withEntry(fold, commitmentId, (entry) => {
    entry.commitment = {
      ...entry.commitment,
      activations: fn(entry.commitment.activations),
    };
  });
}

function foldCreate(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "create" }>,
): void {
  fold.set(edit.commitment.id, { commitment: edit.commitment });
}

function foldSetPrice(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "setPrice" }>,
): void {
  withEntry(fold, edit.commitmentId, (entry) => {
    entry.commitment = { ...entry.commitment, price: edit.price as PriceKind };
  });
}

function foldAddActivation(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "addActivation" }>,
): void {
  mutateActivations(fold, edit.commitmentId, (prev) => [
    ...prev,
    edit.activation,
  ]);
}

function mergeActivationFields(
  prev: Activation,
  fields: Extract<CommitmentEdit, { op: "setActivation" }>["fields"],
): Activation {
  const merged: Activation = { ...prev };
  if (fields.scopeId !== undefined) merged.scopeId = fields.scopeId;
  if (fields.pricePortion !== undefined)
    merged.pricePortion = fields.pricePortion;
  if (fields.leadTime !== undefined) merged.leadTime = fields.leadTime;
  if (fields.buildTime !== undefined) merged.buildTime = fields.buildTime;
  if (fields.throughput !== undefined) merged.throughput = fields.throughput;
  return merged;
}

function foldSetActivation(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "setActivation" }>,
): void {
  mutateActivations(fold, edit.commitmentId, (prev) => {
    const idx = prev.findIndex((a) => a.id === edit.activationId);
    if (idx < 0) return [...prev];
    const next = [...prev];
    next[idx] = mergeActivationFields(prev[idx], edit.fields);
    return next;
  });
}

function foldRemoveActivation(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "removeActivation" }>,
): void {
  mutateActivations(fold, edit.commitmentId, (prev) =>
    prev.filter((a) => a.id !== edit.activationId),
  );
}

function foldVoid(
  fold: FoldMap,
  edit: Extract<CommitmentEdit, { op: "void" }>,
  createdAt: IsoDate,
): void {
  withEntry(fold, edit.commitmentId, (entry) => {
    entry.voidedAt = createdAt;
    entry.voidedReason = edit.reason;
  });
}

/**
 * Apply one edit to the in-progress fold. Exported for the rare consumer
 * that wants to fold a single edit sequence rather than a patch array —
 * scenario assertions, ad-hoc tooling, etc. `apply_patch` itself does not
 * use this (its per-op handlers also emit SQL statements; this path is
 * projection-only).
 */
export function applyEditToFold(
  fold: FoldMap,
  edit: CommitmentEdit,
  createdAt: IsoDate,
): void {
  switch (edit.op) {
    case "create":
      foldCreate(fold, edit);
      break;
    case "setPrice":
      foldSetPrice(fold, edit);
      break;
    case "addActivation":
      foldAddActivation(fold, edit);
      break;
    case "setActivation":
      foldSetActivation(fold, edit);
      break;
    case "removeActivation":
      foldRemoveActivation(fold, edit);
      break;
    case "void":
      foldVoid(fold, edit, createdAt);
      break;
  }
}

/**
 * Fold a patch chain into commitment state. Patches are applied in array
 * order; the caller is responsible for passing them in the intended chain
 * order (parentPatchId-linked), since the fold does not consult
 * `parentPatchId` — it assumes the caller has already linearized the DAG.
 *
 * An edit that references a commitment/activation absent from the fold is
 * silently skipped: this is a *projection*, not a validator. If the patch
 * log is corrupt such that an edit has no target, the fold result will
 * miss that effect and the parity comparison against the materialized
 * tables will surface the drift — which is the point.
 */
export function foldPatches(patches: readonly Patch[]): FoldMap {
  const fold: FoldMap = new Map();
  for (const patch of patches) {
    for (const edit of patch.edits) {
      applyEditToFold(fold, edit, patch.createdAt);
    }
  }
  return fold;
}
