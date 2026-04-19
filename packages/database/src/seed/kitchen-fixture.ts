/**
 * Kitchen-remodel walkthrough fixture — SPEC §2.
 *
 * Populates a complete slice of a GC'd kitchen job (project + job + parties +
 * scope tree + two commitments + NTP + two costs + two patches) into a local
 * DB so M3/M4 UI work has something real to render.
 *
 * This is NOT a test fixture. MCP-tool tests must not import from this
 * module; they should build their own in-test shapes to keep coupling tight.
 * Consumers here are:
 *   - the `db:seed:kitchen:local` CLI
 *   - the idempotency + round-trip tests beside this file
 *
 * Idempotency: each INSERT uses `ON CONFLICT (id) DO NOTHING` (or the
 * commitment_scopes composite key). Re-running the seeder against an already-
 * seeded DB is a no-op and leaves the row count unchanged.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { patchIdFor } from "../patches/hash";
import type * as schema from "../schema";
import { activities } from "../schema/activities";
import {
  activations,
  commitmentScopes,
  commitments,
} from "../schema/commitments";
import type { IsoDate } from "../schema/common";
import { costs } from "../schema/costs";
import type { ActivityId, CommitmentId, JobId, ScopeId } from "../schema/ids";
import { jobs } from "../schema/jobs";
import { ntpEvents } from "../schema/ntp-events";
import { parties } from "../schema/parties";
import type { CommitmentEdit, Patch } from "../schema/patches";
import { patches } from "../schema/patches";
import { projects } from "../schema/projects";
import { scopes } from "../schema/scopes";
import { seedActivities } from "./activities";
import {
  type ActivationSeed,
  FRAMING_ACTIVATIONS,
  FRAMING_COMMITMENT,
  FRAMING_PATCH_CREATED_AT,
  FRAMING_PATCH_MESSAGE,
  KITCHEN_JOB,
  KITCHEN_PARTIES,
  KITCHEN_PROJECT,
  KITCHEN_SCOPES,
  LUMBER_COST,
  LUMBER_DROP_NTP,
  SELF_HW_ACTIVATIONS,
  SELF_HW_COMMITMENT,
  SELF_HW_COST,
  SELF_HW_PATCH_CREATED_AT,
  SELF_HW_PATCH_MESSAGE,
} from "./data/kitchen-fixture";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Look up activity IDs by slug. The starter library uses fresh nanoids per
 * seed run, so the fixture can't hardcode activity IDs — it resolves them by
 * slug post-seed. Throws if any expected slug is missing, which would mean
 * the starter library drifted away from what the fixture needs.
 */
function resolveActivityIds(
  db: Db,
  slugs: readonly string[],
): Map<string, ActivityId> {
  const map = new Map<string, ActivityId>();
  for (const slug of slugs) {
    const row = db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.slug, slug))
      .get();
    if (!row) {
      throw new Error(
        `kitchen-fixture: activity slug "${slug}" missing — starter library drifted`,
      );
    }
    map.set(slug, row.id);
  }
  return map;
}

/**
 * Commitment-edit builder for the "P1: create framing commitment" patch and
 * the analogous self-hw patch. Kept as its own function so the same shape is
 * what we hash AND what lands in the patches.edits column — no drift.
 */
function createCommitmentEdit(
  commitmentId: CommitmentId,
  jobId: JobId,
  price: typeof FRAMING_COMMITMENT.price,
  counterpartyId: typeof FRAMING_COMMITMENT.counterpartyId,
  scopeIds: readonly ScopeId[],
  signedOn: string,
  activationSeeds: readonly ActivationSeed[],
  activityIds: Map<string, ActivityId>,
): CommitmentEdit {
  return {
    op: "create",
    commitment: {
      id: commitmentId,
      jobId,
      counterpartyId,
      price,
      scopeIds: [...scopeIds] as [ScopeId, ...ScopeId[]],
      signedOn,
      activations: activationSeeds.map((a) => ({
        id: a.id,
        activityId: resolveOrThrow(activityIds, a.activitySlug),
        scopeId: a.scopeId,
        pricePortion: a.pricePortion,
        leadTime: { days: a.leadTimeDays },
        buildTime: { days: a.buildTimeDays },
      })),
    },
  };
}

function resolveOrThrow(
  map: Map<string, ActivityId>,
  slug: string,
): ActivityId {
  const id = map.get(slug);
  if (!id)
    throw new Error(`kitchen-fixture: unresolved activity slug "${slug}"`);
  return id;
}

function insertActivations(
  db: Db,
  commitmentId: CommitmentId,
  seeds: readonly ActivationSeed[],
  activityIds: Map<string, ActivityId>,
): void {
  db.insert(activations)
    .values(
      seeds.map((a) => ({
        id: a.id,
        commitmentId,
        activityId: resolveOrThrow(activityIds, a.activitySlug),
        scopeId: a.scopeId,
        pricePortionCents: a.pricePortion.cents,
        leadTimeDays: a.leadTimeDays,
        buildTimeDays: a.buildTimeDays,
      })),
    )
    .onConflictDoNothing({ target: activations.id })
    .run();
}

function insertCommitmentScopes(
  db: Db,
  commitmentId: CommitmentId,
  scopeIds: readonly ScopeId[],
): void {
  db.insert(commitmentScopes)
    .values(scopeIds.map((scopeId) => ({ commitmentId, scopeId })))
    .onConflictDoNothing({
      target: [commitmentScopes.commitmentId, commitmentScopes.scopeId],
    })
    .run();
}

/**
 * Seed the kitchen-remodel walkthrough into `db`. Idempotent: re-running is
 * a no-op (same row count, same IDs). Assumes no concurrent writers — the
 * seed runs offline against a local DB.
 */
export async function seedKitchenFixture(db: Db): Promise<void> {
  seedActivities(db); // Step 0: starter library (needed by commitments + costs).
  const activityIds = resolveActivityIds(db, [
    FRAMING_ACTIVATIONS[0].activitySlug,
    FRAMING_ACTIVATIONS[1].activitySlug,
    FRAMING_ACTIVATIONS[2].activitySlug,
    SELF_HW_ACTIVATIONS[0].activitySlug,
  ]);

  insertProjectJobAndScopes(db);

  // Day 3: framing commitment + Patch P1 wrapping its create.
  insertCommitmentRows(
    db,
    FRAMING_COMMITMENT,
    FRAMING_ACTIVATIONS,
    activityIds,
  );
  const p1Id = await insertFramingPatch(db, activityIds);

  insertLumberDropNtpAndCost(db, activityIds); // Day 10 + Day 14.

  // Day 18: retroactive self-hw commitment + Patch P2 (chained to P1) + cost.
  insertCommitmentRows(
    db,
    SELF_HW_COMMITMENT,
    SELF_HW_ACTIVATIONS,
    activityIds,
  );
  await insertSelfHwPatch(db, p1Id, activityIds);
  insertCostRow(db, SELF_HW_COST, activityIds);
}

function insertProjectJobAndScopes(db: Db): void {
  db.insert(projects)
    .values(KITCHEN_PROJECT)
    .onConflictDoNothing({ target: projects.id })
    .run();
  db.insert(parties)
    .values(KITCHEN_PARTIES)
    .onConflictDoNothing({ target: parties.id })
    .run();
  db.insert(jobs)
    .values(KITCHEN_JOB)
    .onConflictDoNothing({ target: jobs.id })
    .run();
  // Scopes inserted in tree order (root first) so FK to parentId resolves.
  for (const scope of KITCHEN_SCOPES) {
    db.insert(scopes)
      .values(scope)
      .onConflictDoNothing({ target: scopes.id })
      .run();
  }
}

/**
 * Shape shared by FRAMING_COMMITMENT and SELF_HW_COMMITMENT — the fields the
 * seeder writes into the commitments + junction tables. Kept local because
 * no other module needs it.
 */
interface CommitmentSeed {
  id: CommitmentId;
  jobId: JobId;
  counterpartyId: typeof FRAMING_COMMITMENT.counterpartyId;
  price: typeof FRAMING_COMMITMENT.price;
  signedOn: string;
  scopeIds: readonly ScopeId[];
}

function insertCommitmentRows(
  db: Db,
  commitment: CommitmentSeed,
  commitmentActivations: readonly ActivationSeed[],
  activityIds: Map<string, ActivityId>,
): void {
  db.insert(commitments)
    .values({
      id: commitment.id,
      jobId: commitment.jobId,
      counterpartyId: commitment.counterpartyId,
      price: commitment.price,
      signedOn: commitment.signedOn,
    })
    .onConflictDoNothing({ target: commitments.id })
    .run();
  insertActivations(db, commitment.id, commitmentActivations, activityIds);
  insertCommitmentScopes(db, commitment.id, commitment.scopeIds);
}

function framingCommitmentEdit(
  activityIds: Map<string, ActivityId>,
): CommitmentEdit {
  return createCommitmentEdit(
    FRAMING_COMMITMENT.id,
    FRAMING_COMMITMENT.jobId,
    FRAMING_COMMITMENT.price,
    FRAMING_COMMITMENT.counterpartyId,
    FRAMING_COMMITMENT.scopeIds,
    FRAMING_COMMITMENT.signedOn,
    FRAMING_ACTIVATIONS,
    activityIds,
  );
}

async function insertFramingPatch(
  db: Db,
  activityIds: Map<string, ActivityId>,
): Promise<NonNullable<Patch["parentPatchId"]>> {
  return insertCreatePatch(db, {
    jobId: KITCHEN_JOB.id as JobId,
    author: KITCHEN_PARTIES[1].id,
    message: FRAMING_PATCH_MESSAGE,
    createdAt: FRAMING_PATCH_CREATED_AT as IsoDate,
    edit: framingCommitmentEdit(activityIds),
  });
}

async function insertSelfHwPatch(
  db: Db,
  parentPatchId: NonNullable<Patch["parentPatchId"]>,
  activityIds: Map<string, ActivityId>,
): Promise<void> {
  await insertCreatePatch(db, {
    jobId: KITCHEN_JOB.id as JobId,
    author: KITCHEN_PARTIES[1].id,
    message: SELF_HW_PATCH_MESSAGE,
    createdAt: SELF_HW_PATCH_CREATED_AT as IsoDate,
    parentPatchId,
    edit: createCommitmentEdit(
      SELF_HW_COMMITMENT.id,
      SELF_HW_COMMITMENT.jobId,
      SELF_HW_COMMITMENT.price,
      SELF_HW_COMMITMENT.counterpartyId,
      SELF_HW_COMMITMENT.scopeIds,
      SELF_HW_COMMITMENT.signedOn,
      SELF_HW_ACTIVATIONS,
      activityIds,
    ),
  });
}

function insertLumberDropNtpAndCost(
  db: Db,
  activityIds: Map<string, ActivityId>,
): void {
  db.insert(ntpEvents)
    .values(LUMBER_DROP_NTP)
    .onConflictDoNothing({ target: ntpEvents.id })
    .run();
  insertCostRow(db, LUMBER_COST, activityIds);
}

/** CostSeed — the shape the fixture uses for both LUMBER_COST and SELF_HW_COST. */
type CostSeed = typeof LUMBER_COST | typeof SELF_HW_COST;

function insertCostRow(
  db: Db,
  cost: CostSeed,
  activityIds: Map<string, ActivityId>,
): void {
  db.insert(costs)
    .values({
      id: cost.id,
      jobId: cost.jobId,
      scopeId: cost.scopeId,
      commitmentId: cost.commitmentId,
      activityId: resolveOrThrow(activityIds, cost.activitySlug),
      activationId: cost.activationId,
      counterpartyId: cost.counterpartyId,
      amountCents: cost.amount.cents,
      incurredOn: cost.incurredOn,
      source: cost.source,
      memo: cost.memo,
      recordedAt: cost.recordedAt,
    })
    .onConflictDoNothing({ target: costs.id })
    .run();
}

async function insertCreatePatch(
  db: Db,
  input: {
    jobId: JobId;
    author?: Patch["author"];
    message: string;
    createdAt: IsoDate;
    parentPatchId?: Patch["parentPatchId"];
    edit: CommitmentEdit;
  },
): Promise<NonNullable<Patch["parentPatchId"]>> {
  const edits = [input.edit];
  const id = await patchIdFor({
    jobId: input.jobId,
    parentPatchId: input.parentPatchId,
    edits,
    createdAt: input.createdAt,
  });
  db.insert(patches)
    .values({
      id,
      parentPatchId: input.parentPatchId,
      jobId: input.jobId,
      author: input.author,
      message: input.message,
      createdAt: input.createdAt,
      edits,
    })
    .onConflictDoNothing({ target: patches.id })
    .run();
  return id;
}
