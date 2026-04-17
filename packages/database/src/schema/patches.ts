import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { Activation, Commitment, PriceKind } from "./commitments";
import { IsoDate } from "./common";
import { ActivationId, CommitmentId, JobId, PartyId, PatchId } from "./ids";
import { jobs } from "./jobs";
import { parties } from "./parties";

/**
 * CommitmentEdit — SPEC §1. Six ops covering create, price change,
 * activation add/edit/remove, and void. `edits` rides as a JSON array on
 * the `patches` row — no cost op, per SPEC ("Costs are append-only; they
 * are not patched").
 *
 * Scope of edits (spike forks, resolved):
 *   - F1.1: `setActivation.fields` omits `id` AND `activityId`. Renaming the
 *     kind-of-work after the fact rewrites history; if a typo landed at
 *     create time, fix it via `removeActivation` + `addActivation`.
 *   - F1.2: no `setScopes` / `setCounterparty` / `setSignedOn` op for v1.
 *     Changing a commitment's counterparty or declared scope set is rare
 *     enough that void + re-create (per [ADR 0006](../../../../docs/decisions/0006-void-commitment-semantics.md))
 *     produces a cleaner audit trail than edit-log-of-identity-changes.
 *   - F1.3: `removeActivation` with NTP events outstanding is blocked at
 *     the `apply_patch` handler layer (invariant error). NTPs are
 *     schedule-of-record; losing them silently would destroy audit.
 *   - F1.4: `void` excludes the commitment from `committed` rollups; NTPs
 *     and already-recorded costs are preserved. See ADR 0006.
 *   - F1.5: commitment-level invariants (price-vs-sum, scope inclusion per
 *     ADR 0005) are checked post-fold, not per-edit. See
 *     `invariants/commitments.ts` and [ADR 0008](../../../../docs/decisions/0008-apply-patch-atomicity-via-d1-batch.md).
 */
export const CommitmentEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), commitment: Commitment }),
  z.object({
    op: z.literal("setPrice"),
    commitmentId: CommitmentId,
    price: PriceKind,
  }),
  z.object({
    op: z.literal("addActivation"),
    commitmentId: CommitmentId,
    activation: Activation,
  }),
  z.object({
    op: z.literal("setActivation"),
    commitmentId: CommitmentId,
    activationId: ActivationId,
    // `id` and `activityId` are both omitted (F1.1):
    //   - `id` would either no-op or silently rename the row.
    //   - `activityId` would rewrite the kind-of-work retroactively, which
    //     is identity-rewriting the activation; force remove+add if wrong.
    // SPEC says `Activation.partial()`; we tighten both omissions to make
    // the identity-mutating cases unrepresentable.
    fields: Activation.omit({ id: true, activityId: true }).partial(),
  }),
  z.object({
    op: z.literal("removeActivation"),
    commitmentId: CommitmentId,
    activationId: ActivationId,
  }),
  z.object({
    op: z.literal("void"),
    commitmentId: CommitmentId,
    reason: z.string(),
  }),
]);
export type CommitmentEdit = z.infer<typeof CommitmentEdit>;

/**
 * Patch — SPEC §1. Content-addressed; id = `pat_<sha256>` over
 * (parentPatchId, edits, createdAt). Patches form a chain per Job; current
 * commitment state = fold(patches).
 */
export const Patch = z.object({
  id: PatchId,
  parentPatchId: PatchId.optional(),
  jobId: JobId,
  author: PartyId.optional(),
  message: z.string(),
  createdAt: IsoDate,
  edits: z.array(CommitmentEdit).min(1),
});
export type Patch = z.infer<typeof Patch>;

export const patches = sqliteTable("patches", {
  id: text("id").$type<z.infer<typeof PatchId>>().primaryKey(),
  parentPatchId: text("parent_patch_id").$type<z.infer<typeof PatchId>>(),
  jobId: text("job_id")
    .$type<z.infer<typeof JobId>>()
    .notNull()
    .references(() => jobs.id),
  author: text("author")
    .$type<z.infer<typeof PartyId>>()
    .references(() => parties.id),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  edits: text("edits", { mode: "json" }).$type<CommitmentEdit[]>().notNull(),
});

export const tables = { patches };
