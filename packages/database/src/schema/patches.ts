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
    fields: Activation.partial(),
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
