import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { activities } from "./activities";
import { Duration, IsoDay, Money } from "./common";
import {
  ActivationId,
  ActivityId,
  CommitmentId,
  JobId,
  PartyId,
  ScopeId,
} from "./ids";
import { jobs } from "./jobs";
import { parties } from "./parties";
import { scopes } from "./scopes";

/**
 * PriceKind — SPEC §1. Discriminated union stored as a JSON column on the
 * `commitments` row. We never query `WHERE price.kind = 'unit'` — selection
 * is always by job/commitment FK — so flattening buys nothing.
 */
export const PriceKind = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lump"), total: Money }),
  z.object({
    kind: z.literal("unit"),
    perUnit: Money,
    unit: z.string(),
    estimatedUnits: z.number().nonnegative(),
  }),
]);
export type PriceKind = z.infer<typeof PriceKind>;

/** Throughput — optional pacing hint. Small; rides JSON-in-row. */
export const Throughput = z.object({
  units: z.number().positive(),
  per: z.enum(["day", "week"]),
  unit: z.string(),
});
export type Throughput = z.infer<typeof Throughput>;

/**
 * Activation — SPEC §1. Belongs to exactly one Commitment (enforced by FK
 * once the row is inserted). NTP fires per-Activation, not per-Commitment.
 */
export const Activation = z.object({
  id: ActivationId,
  activityId: ActivityId,
  pricePortion: Money,
  leadTime: Duration,
  buildTime: Duration,
  throughput: Throughput.optional(),
});
export type Activation = z.infer<typeof Activation>;

/**
 * Commitment — SPEC §1. Nested `activations` match SPEC shape; storage
 * normalizes them into the `activations` table. Rebuild the nested shape
 * on read via a JOIN and a Zod `.parse()`.
 */
export const Commitment = z.object({
  id: CommitmentId,
  jobId: JobId,
  scopeIds: z.array(ScopeId).min(1),
  counterpartyId: PartyId,
  price: PriceKind,
  activations: z.array(Activation).min(1),
  signedOn: IsoDay.optional(),
});
export type Commitment = z.infer<typeof Commitment>;

export const commitments = sqliteTable("commitments", {
  id: text("id").$type<z.infer<typeof CommitmentId>>().primaryKey(),
  jobId: text("job_id")
    .$type<z.infer<typeof JobId>>()
    .notNull()
    .references(() => jobs.id),
  counterpartyId: text("counterparty_id")
    .$type<z.infer<typeof PartyId>>()
    .notNull()
    .references(() => parties.id),
  price: text("price", { mode: "json" }).$type<PriceKind>().notNull(),
  signedOn: text("signed_on"),
});

export const activations = sqliteTable("activations", {
  id: text("id").$type<z.infer<typeof ActivationId>>().primaryKey(),
  commitmentId: text("commitment_id")
    .$type<z.infer<typeof CommitmentId>>()
    .notNull()
    .references(() => commitments.id),
  activityId: text("activity_id")
    .$type<z.infer<typeof ActivityId>>()
    .notNull()
    .references(() => activities.id),
  pricePortionCents: integer("price_portion_cents").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  buildTimeDays: integer("build_time_days").notNull(),
  throughput: text("throughput", { mode: "json" }).$type<Throughput | null>(),
});

/**
 * Many-to-many: a single Commitment can cover multiple scopes (whole-house
 * paint, framing that touches demo + framing scopes, etc.). The Zod
 * `scopeIds.min(1)` invariant is enforced at app layer — nothing here forces
 * a junction row to exist at commitment-insert time.
 */
export const commitmentScopes = sqliteTable(
  "commitment_scopes",
  {
    commitmentId: text("commitment_id")
      .$type<z.infer<typeof CommitmentId>>()
      .notNull()
      .references(() => commitments.id),
    scopeId: text("scope_id")
      .$type<z.infer<typeof ScopeId>>()
      .notNull()
      .references(() => scopes.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commitmentId, t.scopeId] }),
  }),
);

export const tables = { commitments, activations, commitmentScopes };
