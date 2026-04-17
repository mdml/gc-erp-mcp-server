import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { activities } from "./activities";
import { activations, commitments } from "./commitments";
import { IsoDate, IsoDay, Money } from "./common";
import {
  ActivationId,
  ActivityId,
  CommitmentId,
  CostId,
  DocumentId,
  JobId,
  PartyId,
  ScopeId,
} from "./ids";
import { jobs } from "./jobs";
import { parties } from "./parties";
import { scopes } from "./scopes";

/**
 * CostSource — SPEC §1. Four variants: invoice, direct, tm, adjustment.
 * Stored as a JSON column; no query pattern currently indexes `kind`.
 */
export const CostSource = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("invoice"),
    invoiceNumber: z.string(),
    receivedOn: IsoDay,
    documentId: DocumentId.optional(),
  }),
  z.object({
    kind: z.literal("direct"),
    note: z.string().optional(),
    documentId: DocumentId.optional(),
  }),
  z.object({
    kind: z.literal("tm"),
    hours: z.number().optional(),
    documentId: DocumentId.optional(),
  }),
  z.object({
    kind: z.literal("adjustment"),
    reason: z.string(),
  }),
]);
export type CostSource = z.infer<typeof CostSource>;

/**
 * Cost — SPEC §1. Append-only money event (tool-layer discipline;
 * no DB-level trigger). Every Cost references scope + commitment + activity;
 * cross-jobId invariants live in `src/invariants/costs.ts`.
 */
export const Cost = z.object({
  id: CostId,
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
  recordedAt: IsoDate,
});
export type Cost = z.infer<typeof Cost>;

export const costs = sqliteTable("costs", {
  id: text("id").$type<z.infer<typeof CostId>>().primaryKey(),
  jobId: text("job_id")
    .$type<z.infer<typeof JobId>>()
    .notNull()
    .references(() => jobs.id),
  scopeId: text("scope_id")
    .$type<z.infer<typeof ScopeId>>()
    .notNull()
    .references(() => scopes.id),
  commitmentId: text("commitment_id")
    .$type<z.infer<typeof CommitmentId>>()
    .notNull()
    .references(() => commitments.id),
  activityId: text("activity_id")
    .$type<z.infer<typeof ActivityId>>()
    .notNull()
    .references(() => activities.id),
  activationId: text("activation_id")
    .$type<z.infer<typeof ActivationId>>()
    .references(() => activations.id),
  counterpartyId: text("counterparty_id")
    .$type<z.infer<typeof PartyId>>()
    .notNull()
    .references(() => parties.id),
  amountCents: integer("amount_cents").notNull(),
  incurredOn: text("incurred_on").notNull(),
  source: text("source", { mode: "json" }).$type<CostSource>().notNull(),
  memo: text("memo"),
  recordedAt: text("recorded_at").notNull(),
});

export const tables = { costs };
