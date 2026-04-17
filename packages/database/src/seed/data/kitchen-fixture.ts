/**
 * Kitchen-remodel walkthrough data — SPEC §2 ("Day 0 through Day 18").
 *
 * Pure declarative constants. No DB imports so drizzle-kit can never pick
 * this module up as a table source. The actual seeding logic lives in
 * `../kitchen-fixture.ts`.
 *
 * Coverage: excluded via `vitest.config.ts` → `src/seed/data/**`. Pure data.
 *
 * Scope of this fixture — what SPEC §2 writes concretely:
 *   - Day 0:  project + job + 11-node scope tree
 *   - Day 3:  commitment c_frame (Rogelio, $8,500 lump, 3 activations) in patch P1
 *   - Day 10: NTP on the lumber-drop activation
 *   - Day 14: cost against the lumber-drop activation
 *   - Day 18: retroactive commitment c_self_hw ($120 lump, self) in patch P2
 *             + cost recorded against it
 *
 * SPEC §2's Day 30+ sketches (cabinets/electrical/plumbing commitments, the
 * CO-#1 pantry patch, the first pay app) are intentionally omitted — they
 * aren't specified concretely enough to seed without inventing. When those
 * sections get locked, extend this file, don't copy it.
 */

import type { PriceKind } from "../../schema/commitments";
import type { Money } from "../../schema/common";
import type { CostSource } from "../../schema/costs";
import type {
  ActivationId,
  CommitmentId,
  CostId,
  JobId,
  NTPEventId,
  PartyId,
  ProjectId,
  ScopeId,
} from "../../schema/ids";
import type { ScopeSpec } from "../../schema/scopes";

const usd = (cents: number): Money => ({ cents, currency: "USD" });

/** Stable IDs — named constants so downstream tools can reference rows by
 * semantic handle (e.g. `KITCHEN_IDS.commitments.frame`) without rediscovery. */
export const KITCHEN_IDS = {
  project: "proj_main_st" as ProjectId,
  job: "job_kitchen" as JobId,
  parties: {
    rogelio: "party_rogelio" as PartyId,
    max: "party_max" as PartyId,
  },
  scopes: {
    kitchen: "scope_kitchen" as ScopeId,
    demo: "scope_demo" as ScopeId,
    framing: "scope_framing" as ScopeId,
    electrical: "scope_electrical" as ScopeId,
    plumbing: "scope_plumbing" as ScopeId,
    drywall: "scope_drywall" as ScopeId,
    cabinets: "scope_cabinets" as ScopeId,
    countertops: "scope_countertops" as ScopeId,
    appliances: "scope_appliances" as ScopeId,
    backsplash: "scope_backsplash" as ScopeId,
    paint: "scope_paint" as ScopeId,
    punch: "scope_punch" as ScopeId,
  },
  commitments: {
    frame: "cm_frame" as CommitmentId,
    selfHw: "cm_self_hw" as CommitmentId,
  },
  activations: {
    lumberDrop: "actv_drop" as ActivationId,
    frame: "actv_frame" as ActivationId,
    punch: "actv_punch" as ActivationId,
    selfHw: "actv_self_hw" as ActivationId,
  },
  ntp: {
    lumberDrop1: "ntp_drop_1" as NTPEventId,
  },
  costs: {
    lumber1: "cost_lumber_1" as CostId,
    selfHw1: "cost_self_hw_1" as CostId,
  },
} as const;

/** Activity slugs referenced by this fixture — all present in the starter
 * library (`seed/data/activities.ts`). The fixture looks up live IDs by slug
 * after `seedActivities` runs, so the fixture never hardcodes activity IDs. */
export const KITCHEN_ACTIVITY_SLUGS = {
  lumberDrop: "lumber_drop",
  frame: "frame",
  punch: "punch",
  materialsDirect: "materials_direct",
} as const;

// --- Day 0: project + job ----------------------------------------------

export const KITCHEN_PROJECT = {
  id: KITCHEN_IDS.project,
  name: "Main St Remodel",
  slug: "main-st",
} as const;

export const KITCHEN_JOB = {
  id: KITCHEN_IDS.job,
  projectId: KITCHEN_IDS.project,
  name: "Kitchen",
  slug: "kitchen",
  address: "123 Main St",
  clientPartyId: KITCHEN_IDS.parties.max,
  startedOn: "2026-04-18",
} as const;

// --- Parties (Rogelio the framer, Max the self-GC) ---------------------

export const KITCHEN_PARTIES = [
  {
    id: KITCHEN_IDS.parties.rogelio,
    kind: "org" as const,
    name: "Rogelio's Framing LLC",
  },
  {
    id: KITCHEN_IDS.parties.max,
    kind: "person" as const,
    name: "Max",
  },
];

// --- Day 0: scope tree -------------------------------------------------

interface ScopeSeed {
  id: ScopeId;
  jobId: JobId;
  parentId?: ScopeId;
  name: string;
  spec: ScopeSpec;
}

const emptySpec: ScopeSpec = { materials: [] };

/**
 * Scope-tree seed matching SPEC §2's diagram:
 *
 *   Kitchen (root)
 *   ├── Demo
 *   ├── Framing
 *   ├── Electrical rough-in
 *   ├── Plumbing rough-in
 *   ├── Drywall & finish
 *   ├── Cabinets (spec.materials + installNotes)
 *   ├── Countertops (spec.materials)
 *   ├── Appliances
 *   ├── Backsplash
 *   ├── Paint
 *   └── Punch
 *
 * SPEC shorthand (`qty: 4` without a `description`) doesn't quite match the
 * schema (`description` is required on a material). The descriptions below
 * are minimal expansions of the SKUs in SPEC — not a schema fork.
 */
export const KITCHEN_SCOPES: readonly ScopeSeed[] = [
  {
    id: KITCHEN_IDS.scopes.kitchen,
    jobId: KITCHEN_IDS.job,
    name: "Kitchen",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.demo,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Demo",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.framing,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Framing (pony wall for island)",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.electrical,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Electrical rough-in",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.plumbing,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Plumbing rough-in",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.drywall,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Drywall & finish",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.cabinets,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Cabinets",
    spec: {
      materials: [
        {
          sku: "IKEA-BODBYN-W-30",
          description: 'BODBYN white 30" wall cabinet',
          quantity: 4,
        },
      ],
      installNotes: "Soft-close, level to countertop template",
    },
  },
  {
    id: KITCHEN_IDS.scopes.countertops,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Countertops",
    spec: {
      materials: [
        {
          sku: "CAMBRIA-BRITANNICA-3CM",
          description: "Cambria Britannica quartz 3cm slab",
          quantity: 42,
          unit: "sqft",
        },
      ],
    },
  },
  {
    id: KITCHEN_IDS.scopes.appliances,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Appliances",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.backsplash,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Backsplash",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.paint,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Paint",
    spec: emptySpec,
  },
  {
    id: KITCHEN_IDS.scopes.punch,
    jobId: KITCHEN_IDS.job,
    parentId: KITCHEN_IDS.scopes.kitchen,
    name: "Punch",
    spec: emptySpec,
  },
];

// --- Day 3: framing commitment (wrapped in Patch P1) -------------------

export const FRAMING_PRICE: PriceKind = {
  kind: "lump",
  total: usd(8_500_00),
};

export interface ActivationSeed {
  id: ActivationId;
  activitySlug: string;
  /** ADR 0005: activation attributes its pricePortion to one scope. */
  scopeId: ScopeId;
  pricePortion: Money;
  leadTimeDays: number;
  buildTimeDays: number;
}

export const FRAMING_ACTIVATIONS: readonly ActivationSeed[] = [
  {
    id: KITCHEN_IDS.activations.lumberDrop,
    activitySlug: KITCHEN_ACTIVITY_SLUGS.lumberDrop,
    scopeId: KITCHEN_IDS.scopes.demo,
    pricePortion: usd(500_00),
    leadTimeDays: 5,
    buildTimeDays: 1,
  },
  {
    id: KITCHEN_IDS.activations.frame,
    activitySlug: KITCHEN_ACTIVITY_SLUGS.frame,
    scopeId: KITCHEN_IDS.scopes.framing,
    pricePortion: usd(7_000_00),
    leadTimeDays: 3,
    buildTimeDays: 3,
  },
  {
    id: KITCHEN_IDS.activations.punch,
    activitySlug: KITCHEN_ACTIVITY_SLUGS.punch,
    scopeId: KITCHEN_IDS.scopes.demo,
    pricePortion: usd(1_000_00),
    leadTimeDays: 0,
    buildTimeDays: 1,
  },
];

export const FRAMING_COMMITMENT = {
  id: KITCHEN_IDS.commitments.frame,
  jobId: KITCHEN_IDS.job,
  counterpartyId: KITCHEN_IDS.parties.rogelio,
  price: FRAMING_PRICE,
  scopeIds: [
    KITCHEN_IDS.scopes.demo,
    KITCHEN_IDS.scopes.framing,
  ] as readonly ScopeId[],
  signedOn: "2026-04-18",
} as const;

export const FRAMING_PATCH_MESSAGE = "Rogelio framing contract";
export const FRAMING_PATCH_CREATED_AT = "2026-04-18T12:00:00.000Z";

// --- Day 10: NTP on lumber drop ----------------------------------------

export const LUMBER_DROP_NTP = {
  id: KITCHEN_IDS.ntp.lumberDrop1,
  activationId: KITCHEN_IDS.activations.lumberDrop,
  issuedOn: "2026-04-27",
} as const;

// --- Day 14: first cost (lumber yard invoice) --------------------------

export const LUMBER_COST_AMOUNT: Money = usd(480_00);

export const LUMBER_COST_SOURCE: CostSource = {
  kind: "invoice",
  invoiceNumber: "LY-7791",
  receivedOn: "2026-05-04",
};

export const LUMBER_COST = {
  id: KITCHEN_IDS.costs.lumber1,
  jobId: KITCHEN_IDS.job,
  scopeId: KITCHEN_IDS.scopes.demo,
  commitmentId: KITCHEN_IDS.commitments.frame,
  activationId: KITCHEN_IDS.activations.lumberDrop,
  activitySlug: KITCHEN_ACTIVITY_SLUGS.lumberDrop,
  counterpartyId: KITCHEN_IDS.parties.rogelio,
  amount: LUMBER_COST_AMOUNT,
  incurredOn: "2026-05-04",
  source: LUMBER_COST_SOURCE,
  memo: "first lumber drop",
  recordedAt: "2026-05-04T15:00:00.000Z",
} as const;

// --- Day 18: retroactive self-hw commitment (Patch P2) + its cost ------

export const SELF_HW_PRICE: PriceKind = {
  kind: "lump",
  total: usd(120_00),
};

export const SELF_HW_ACTIVATIONS: readonly ActivationSeed[] = [
  {
    id: KITCHEN_IDS.activations.selfHw,
    activitySlug: KITCHEN_ACTIVITY_SLUGS.materialsDirect,
    scopeId: KITCHEN_IDS.scopes.framing,
    pricePortion: usd(120_00),
    leadTimeDays: 0,
    buildTimeDays: 0,
  },
];

export const SELF_HW_COMMITMENT = {
  id: KITCHEN_IDS.commitments.selfHw,
  jobId: KITCHEN_IDS.job,
  counterpartyId: KITCHEN_IDS.parties.max,
  price: SELF_HW_PRICE,
  scopeIds: [KITCHEN_IDS.scopes.framing] as readonly ScopeId[],
  signedOn: "2026-05-01",
} as const;

export const SELF_HW_PATCH_MESSAGE =
  "Retroactive self-hardware commitment for bracing";
export const SELF_HW_PATCH_CREATED_AT = "2026-05-01T17:00:00.000Z";

export const SELF_HW_COST_SOURCE: CostSource = {
  kind: "direct",
  note: "Bracing hardware picked up at lumberyard on personal card",
};

export const SELF_HW_COST = {
  id: KITCHEN_IDS.costs.selfHw1,
  jobId: KITCHEN_IDS.job,
  scopeId: KITCHEN_IDS.scopes.framing,
  commitmentId: KITCHEN_IDS.commitments.selfHw,
  activationId: KITCHEN_IDS.activations.selfHw,
  activitySlug: KITCHEN_ACTIVITY_SLUGS.materialsDirect,
  counterpartyId: KITCHEN_IDS.parties.max,
  amount: usd(120_00),
  incurredOn: "2026-05-01",
  source: SELF_HW_COST_SOURCE,
  memo: "Bracing hardware — direct buy",
  recordedAt: "2026-05-01T17:05:00.000Z",
} as const;
