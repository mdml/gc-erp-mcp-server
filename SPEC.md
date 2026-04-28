# GC ERP MCP Server — Spec

> This is the contract for future sessions. The product is an **MCP server** — a TypeScript package distributed via `npx` / MCP client install — that exposes a commitment-based GC data model, tool methods, and MCP "apps" (UI components via the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview)).
>
> Initial use case: Max + Salman GC'ing our own projects (1–5/year). Dogfood-first.
>
> **For the data-model big ideas — *why* it's shaped this way — see [docs/guides/ABSTRACTIONS.md](docs/guides/ABSTRACTIONS.md). This file is the schema; that guide is the framing.**

---

## 1. Core types (Zod)

Types + invariants only. No handlers, no persistence. IDs are branded strings. Money is an integer in cents (`number`, not `bigint` — amounts are bounded). Dates are ISO-8601 strings.

```ts
import { z } from "zod";

// --- Branded IDs --------------------------------------------------------

const brand = <T extends string>(name: T) =>
  z.string().min(1).brand<T>();

export const ProjectId      = brand("ProjectId");
export const JobId          = brand("JobId");
export const ScopeId        = brand("ScopeId");
export const ActivityId     = brand("ActivityId");
export const CommitmentId   = brand("CommitmentId");
export const ActivationId   = brand("ActivationId");
export const NTPEventId     = brand("NTPEventId");
export const CostId         = brand("CostId");
export const PatchId        = brand("PatchId");
export const PartyId        = brand("PartyId"); // people + orgs
export const DocumentId     = brand("DocumentId");

// --- Shared --------------------------------------------------------------

export const Money = z.object({
  cents: z.number().int(),          // signed: negatives for credits
  currency: z.literal("USD"),       // v1: USD only
});

export const IsoDate = z.string().datetime();   // point in time
export const IsoDay  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // calendar day

export const Duration = z.object({
  days: z.number().int().nonnegative(),
  // invariant: working days, not calendar days. Calendar ↔ working
  // conversion is a rendering concern, not a schema concern.
});

// --- Party (people + orgs, minimal v1) ----------------------------------

export const Party = z.object({
  id: PartyId,
  kind: z.enum(["person", "org"]),
  name: z.string(),
  email: z.string().email().optional(),
  // invariant: a Party is both "sub" and "client" depending on context.
  // No role field in v1 — role is implied by the commitment/job it's on.
});

// --- Project + Job ------------------------------------------------------

export const Project = z.object({
  id: ProjectId,
  name: z.string(),
  slug: z.string(),
  // v1 intentionally thin. Contract roll-down to jobs is an open question.
});

export const Job = z.object({
  id: JobId,
  projectId: ProjectId,
  name: z.string(),
  slug: z.string(),
  address: z.string().optional(),
  clientPartyId: PartyId.optional(),
  startedOn: IsoDay.optional(),
  // invariant: a Job belongs to exactly one Project. v1 typically 1 job/project.
});

// --- Scope: nested tree, attached to a Job; it IS the tech spec ----------

export const ScopeSpec = z.object({
  // Apple-tech-spec-style: what gets built, not who builds it.
  materials: z.array(z.object({
    sku: z.string().optional(),
    description: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
  })).default([]),
  installNotes: z.string().optional(),
  // Open: link to Plans + Options when we add them. Slot reserved.
  planRef: z.string().optional(),
  optionRef: z.string().optional(),
});

export const Scope = z.object({
  id: ScopeId,
  jobId: JobId,
  parentId: ScopeId.optional(),     // tree; root when absent
  name: z.string(),                 // "Kitchen", "Framing", "Cabinets"
  code: z.string().optional(),      // CSI? custom? — see Open Questions
  spec: ScopeSpec.default({ materials: [] }),
  // invariants:
  //   - tree is per-Job (parentId must resolve to a Scope with same jobId)
  //   - no cycles
  //   - a scope may have zero or many commitments
  //   - costs roll up the tree for reporting
});

// --- Activity: SERVER-LEVEL shared taxonomy (cross-project) -------------

export const Activity = z.object({
  id: ActivityId,
  name: z.string(),                 // "Lumber Drop", "Frame", "Punch",
                                    // "Cabinet Delivery", "Cabinet Install"
  slug: z.string(),
  defaultUnit: z.string().optional(),  // "lf", "sqft", "ea", "hr"
  // invariants:
  //   - lives outside any specific job — shared library
  //   - a growing taxonomy; new activities added as real work surfaces
  //   - "cost name" in the user's vocabulary
});

// --- Commitment: the 5-tuple contract, with activations ------------------

export const PriceKind = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lump"), total: Money }),
  z.object({ kind: z.literal("unit"), perUnit: Money, unit: z.string(),
             estimatedUnits: z.number().nonnegative() }),
]);

export const Activation = z.object({
  id: ActivationId,
  activityId: ActivityId,
  scopeId: ScopeId,                 // where this price portion attributes
  // Schedule-of-values portion of the commitment's total price.
  // For lump: a dollar portion. For unit: an estimated-units portion.
  pricePortion: Money,
  leadTime:  Duration,              // NTP → start
  buildTime: Duration,              // start → finish
  throughput: z.object({
    units: z.number().positive(),
    per: z.enum(["day", "week"]),
    unit: z.string(),               // "lf", "sqft", "ea", ...
  }).optional(),
  // invariants:
  //   - belongs to exactly one Commitment (parent-owned, not standalone)
  //   - NTP fires per Activation (not per Commitment)
  //   - finishBy = NTP.issuedOn + leadTime + buildTime (working days)
  //   - scopeId ∈ parent Commitment.scopeIds (see ADR 0005)
  //   - rollup: scope.committed = sum(activation.pricePortion WHERE
  //     activation.scopeId ∈ subtree(scope))
});

export const Commitment = z.object({
  id: CommitmentId,
  jobId: JobId,                     // commitments live on jobs, not projects
  scopeIds: z.array(ScopeId).min(1),// declared coverage; activations attribute
                                    // their pricePortion to one of these scopes
  counterpartyId: PartyId,          // the sub
  price: PriceKind,
  activations: z.array(Activation).min(1),
  signedOn: IsoDay.optional(),
  // invariants:
  //   - every Cost MUST reference a Commitment (commitment may be
  //     created retroactively at the moment the cost is recorded)
  //   - sum(activation.pricePortion) == price.total (for lump)
  //     or == price.perUnit * price.estimatedUnits (for unit)
  //   - a Commitment with one Activation is the common "simple" case
  //   - every activation.scopeId ∈ this.scopeIds (ADR 0005)
});

// --- Notice to Proceed: first-class event --------------------------------

export const NTPEvent = z.object({
  id: NTPEventId,
  activationId: ActivationId,       // points at activation, not commitment
  issuedOn: IsoDay,
  note: z.string().optional(),
  // DERIVED (not stored):
  //   startBy  = issuedOn + activation.leadTime           (ADR 0007: current
  //   finishBy = startBy  + activation.buildTime            activation, not
  //   variance = actualFinish - finishBy   (computed once    frozen at issue)
  //                                         activation closes)
  // invariants:
  //   - multiple NTPs allowed per activation (re-issue after delay);
  //     the latest one is authoritative for schedule
  //   - cannot be mutated; issue a new NTPEvent to re-NTP
  //   - no `siteReady` flag: the site-blocked-on-arrival case is tracked
  //     via a future DelayEvent (see backlog.md). See ADR 0007.
});

// --- Document: content-addressed blob metadata --------------------------

export const Document = z.object({
  id: DocumentId,                                   // canonical form: "doc_" + sha256
  sha256: z.string().regex(/^[0-9a-f]{64}$/),       // authoritative; R2 key derived from this
  mimeType: z.string(),
  originalFilename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: IsoDate,
  uploadedBy: PartyId.optional(),
  jobId: JobId.optional(),                          // some docs are project-scoped (insurance, architect set)
  tags: z.array(z.string()).default([]),            // free-form v1; seed: "invoice","plan","contract","receipt","photo","lien_waiver"
  // invariants:
  //   - id = "doc_" + sha256 (content-addressed; identical bytes → same Document row)
  //   - R2 object key = "documents/" + sha256 (derived, not stored on the row)
  //   - Document rows are permanent audit records. R2 object may be GC'd later
  //     under a retention policy (not v1).
  //   - No versioning in v1. A corrected re-send is a new sha256 → new row;
  //     `supersedes: DocumentId` linkage is deferred.
});

// --- Cost: append-only money event --------------------------------------

export const CostSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invoice"),   invoiceNumber: z.string(),
             receivedOn: IsoDay, documentId: DocumentId.optional() }),
  z.object({ kind: z.literal("direct"),    note: z.string().optional(),
             documentId: DocumentId.optional() }),  // petty cash, direct buy; receipt photo optional
  z.object({ kind: z.literal("tm"),        hours: z.number().optional(),
             documentId: DocumentId.optional() }), // time & materials
  z.object({ kind: z.literal("adjustment"),reason: z.string() }),           // true-up
]);

export const Cost = z.object({
  id: CostId,
  jobId: JobId,
  scopeId: ScopeId,                 // REQUIRED — "every cost belongs to a scope"
  commitmentId: CommitmentId,       // REQUIRED — even if retro-created
  activityId: ActivityId,           // what kind of cost this is
  activationId: ActivationId.optional(), // nice-to-have when known
  counterpartyId: PartyId,
  amount: Money,                    // signed; negative = credit
  incurredOn: IsoDay,
  source: CostSource,
  memo: z.string().optional(),
  recordedAt: IsoDate,              // when WE logged it (audit)
  // invariants:
  //   - append-only. Never edit a Cost; issue an adjustment Cost instead.
  //   - scopeId's Scope.jobId must equal Cost.jobId
  //   - commitmentId's Commitment.jobId must equal Cost.jobId
  //   - activity is shared-library; scope is per-job
});

// --- Patch: content-addressed group of commitment edits ------------------

export const CommitmentEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"),      commitment: Commitment }),
  z.object({ op: z.literal("setPrice"),    commitmentId: CommitmentId, price: PriceKind }),
  z.object({ op: z.literal("addActivation"), commitmentId: CommitmentId, activation: Activation }),
  z.object({ op: z.literal("setActivation"), commitmentId: CommitmentId, activationId: ActivationId,
             fields: Activation.omit({ id: true, activityId: true }).partial() }),
  z.object({ op: z.literal("removeActivation"), commitmentId: CommitmentId, activationId: ActivationId }),
  z.object({ op: z.literal("void"),        commitmentId: CommitmentId, reason: z.string() }),
  // invariants:
  //   - no op edits a Cost. Costs are append-only; they are not patched.
  //   - no setScopes/setCounterparty/setSignedOn ops — changing identity
  //     fields of a commitment is void + re-create (ADR 0006).
  //   - setActivation omits activityId — renaming kind-of-work retroactively
  //     rewrites history; force remove+add. See packages/database/src/schema/patches.ts.
  //   - invariants are checked post-fold per patch (ADR 0008), not per-edit.
]);

export const Patch = z.object({
  id: PatchId,                      // == content hash
  parentPatchId: PatchId.optional(),
  jobId: JobId,
  author: PartyId.optional(),
  message: z.string(),              // "change order #3: add pantry"
  createdAt: IsoDate,
  edits: z.array(CommitmentEdit).min(1),
  // invariants:
  //   - content-addressed: id = hash(parentPatchId || edits || createdAt)
  //   - a Patch is applied atomically or not at all
  //   - Patches form a chain (or DAG, if we later support branches) per Job;
  //     current commitment state = fold(patches)
  //   - the empty/initial commitment set is the root; first patch creates
});
```

### Derived / non-stored

- `activation.startBy  = latestNTP(activation).issuedOn + activation.leadTime`
- `activation.finishBy = activation.startBy            + activation.buildTime`
- `scope.budget         = sum(activation.pricePortion for activations in commitments with scopeIds ∋ scope.id)` (rolled up the tree)
- `scope.committed      = same as budget, in v1` (budget and committed collapse pre-pay-app; see Open Questions)
- `scope.cost           = sum(Cost.amount where Cost.scopeId ∈ subtree(scope))`
- `scope.variance$      = scope.committed - scope.cost` (simplistic; see Open Q on % complete)

---

## 2. Narrative walkthrough — small kitchen remodel

Setting: I'm GC'ing a small kitchen remodel for myself. Demo one non-bearing wall, new cabinets, new countertop, new appliances, lighting refresh. Salman is along for a couple of reviews. The whole thing is one `Project` with one `Job`.

### Day 0 — scaffolding the job

I open Claude Desktop, which has the GC ERP MCP server plugged in. I say "start a new project for the kitchen remodel at 123 Main St." Claude calls `project.create` → `{ id: p_main, name: "Main St Remodel", slug: "main-st" }`. Then `job.create` under it → `{ id: j_kitchen, projectId: p_main, name: "Kitchen", slug: "kitchen", address: "123 Main St" }`.

Next I build the scope tree. This is where the Apple-tech-spec thing matters: I'm not listing subs, I'm listing *what's being built*. I dictate and Claude drafts, I correct:

```
Kitchen                         (root scope)
├── Demo
├── Framing (pony wall for island)
├── Electrical rough-in
├── Plumbing rough-in
├── Drywall & finish
├── Cabinets
│   └── spec.materials: [ { sku: "IKEA-BODBYN-W-30", description: "BODBYN white 30\" wall cabinet", quantity: 4 }, ... ]
│   └── spec.installNotes: "Soft-close, level to countertop template"
├── Countertops
│   └── spec.materials: [ { sku: "CAMBRIA-BRITANNICA-3CM", description: "Cambria Britannica quartz 3cm slab", quantity: 42, unit: "sqft" } ]
├── Appliances
├── Backsplash
├── Paint
└── Punch
```

Nothing has been committed yet. The scope tree is purely *what* we intend to build. The dashboard would show: "Kitchen — no commitments, no costs. Scope tree defined."

### Day 3 — first sub commitment (Framer)

Salman refers his framer, Rogelio's Framing LLC. I get a verbal quote: $8,500 lump, three pieces of work — a small lumber drop a day before, the frame itself, and a punch list walkthrough at the end.

In Claude I say "create a framing commitment with Rogelio for $8,500 lump, covers lumber drop, framing, and punch." The MCP server has `Activity` rows already in its shared library for "Lumber Drop", "Frame", and "Punch" — these aren't job-specific, they exist server-wide. Claude calls `commitment.create`:

```
Commitment c_frame {
  jobId: j_kitchen,
  scopeIds: [s_demo, s_framing],    // declared coverage
  counterpartyId: party_rogelio,
  price: { kind: "lump", total: $8,500 },
  activations: [
    { id: a_drop,  activityId: act_lumberDrop, scopeId: s_demo,    pricePortion: $500,   leadTime: 5d, buildTime: 1d },
    { id: a_frame, activityId: act_frame,      scopeId: s_framing, pricePortion: $7,000, leadTime: 3d, buildTime: 3d },
    { id: a_punch, activityId: act_punch,      scopeId: s_demo,    pricePortion: $1,000, leadTime: 0d, buildTime: 1d },
  ],
  signedOn: 2026-04-18,
}
```

This is wrapped in a `Patch`:

```
Patch P1 {
  parentPatchId: none,
  jobId: j_kitchen,
  message: "Rogelio framing contract",
  edits: [ { op: "create", commitment: c_frame } ],
}
```

Dashboard now: `Kitchen > Framing` shows committed $7,000, `Kitchen > Demo` shows committed $500+$1,000 (drop and punch both land on demo), rolled up Kitchen total committed $8,500, cost $0.

### Day 10 — issue NTP for lumber drop

Rogelio calls: he can drop lumber Monday. I confirm the site is clear. I say "NTP the lumber drop for Monday."

`ntp.issue({ activationId: a_drop, issuedOn: 2026-04-27 })` → creates `NTPEvent n1`. Derived: `startBy = 2026-05-04` (5 working days lead), `finishBy = 2026-05-05`.

Dashboard: `Kitchen > Framing > lumber drop` shows "NTP issued 4/27, start-by 5/4, finish-by 5/5". No variance yet — the activation isn't closed.

### Day 14 — first cost (lumber invoice)

The lumber yard (billing through Rogelio) sends an invoice for $480. Claude ingests it via the email integration, proposes a `Cost`:

```
Cost cost_1 {
  jobId: j_kitchen,
  scopeId: s_demo,                  // drop lands here
  commitmentId: c_frame,
  activityId: act_lumberDrop,
  activationId: a_drop,
  counterpartyId: party_rogelio,
  amount: $480,
  incurredOn: 2026-05-04,
  source: { kind: "invoice", invoiceNumber: "LY-7791", receivedOn: 2026-05-04 },
}
```

Append-only; no edit. Dashboard: `Kitchen > Demo` now shows committed $1,500 (drop + punch), cost $480, committed-minus-cost $1,020.

### Day 18 — unexpected cost, retroactive commitment

I pick up some bracing hardware myself at the lumberyard — $120 on my card. There's no sub for this, but **every cost must belong to a commitment**. So Claude proposes creating a retroactive commitment to myself as the counterparty:

```
Commitment c_self_hw {
  jobId: j_kitchen,
  scopeIds: [s_framing],
  counterpartyId: party_max,
  price: { kind: "lump", total: $120 },
  activations: [{ activityId: act_materials_direct, pricePortion: $120,
                  leadTime: 0d, buildTime: 0d }],
  signedOn: 2026-05-01,
}
```

wrapped in Patch P2, and the cost is recorded against it. This is ugly but it preserves the invariant. (See Open Questions: should "direct materials" have a lighter-weight escape hatch?)

### Day 30 — cabinets, countertops, electrician, plumber...

Same pattern. Each new sub → a new `Commitment` in a new `Patch`. Each physical start → an `NTPEvent` on the relevant activation. Each invoice or direct buy → a `Cost` that references (scope, commitment, activity). The scope tree collects cost; the commitment collects price; the activation tracks schedule.

For the countertop, the commitment is unit-priced:

```
price: { kind: "unit", perUnit: $75, unit: "sqft", estimatedUnits: 42 }
// expected total = $3,150
```

### Day 45 — first pay app

End of month 1. It's time to generate a pay app to the client (which, in this self-GC case, is also me — but we run the process for rehearsal + audit). Claude drafts an AIA G702/G703:

- **G703 line items**: one line per activation (or per commitment; see Open Questions). For each:
  - Scheduled value = `activation.pricePortion`
  - Work completed this period / previous period → **Open Question: derived from what?** Options: operator-reported % per activation, cost-to-committed ratio, activation state machine (NTP'd / started / finished).
  - Retainage %
- **G702**: totals roll up from G703.

The server renders a PDF. Nothing about the pay app mutates commitments or costs — it's a *view* over current state at a point in time.

Dashboard at this stage would show, per top-level scope:

| scope        | committed | cost to date | billed (this pay app) | paid |
|--------------|-----------|--------------|-----------------------|------|
| Demo         | $1,500    | $1,500       | $1,500                | $0   |
| Framing      | $7,120    | $7,000       | $7,000                | $0   |
| Electrical   | …         | …            | …                     | …    |

Plus a schedule panel showing each activation: NTP date, start-by, finish-by, actual finish if closed, variance.

### Day 60 — change order

Client (me) decides to add a pantry. This is a `Patch`:

```
Patch P7 {
  parentPatchId: P6,
  jobId: j_kitchen,
  message: "CO #1: add pantry — add framing activation + revise cabinet commitment",
  edits: [
    { op: "addActivation", commitmentId: c_frame,
      activation: { activityId: act_frame, pricePortion: $900, leadTime: 2d, buildTime: 1d } },
    { op: "setPrice", commitmentId: c_cabinets, price: { kind: "lump", total: $14,200 } },
  ],
}
```

Patches are content-addressed so P7's id = hash(P6, edits, createdAt). Current commitment state is `fold(P1..P7)`. Rewinding for audit is fold-to-patch-N.

### End

By the last pay app + lien waivers, the job is closed. The dashboard shows final cost vs. final committed, schedule variance per activation, and a patch chain that tells the story of how the budget moved from initial to final.

---

## 3. Decisions

Mirroring and restating the locked decisions that shaped this spec:

- **The product is an MCP server.** Not a web app. Distribution is `npx` / MCP client install. UI lives inside the server as MCP apps.
- **Dogfood-first.** Me + Salman on 1–5 jobs/year. No multi-tenant, no auth, no permissions in v1.
- **Commitment-based data model.** 5-tuple: price, scope, throughput, lead time, build time.
- **Activations inside commitments.** A commitment is one contract with one sub; activations are the schedulable units. NTP fires against an activation.
- **NTP is a first-class event.** `startBy` and `finishBy` fall out automatically; multiple NTPs allowed per activation (latest wins).
- **Costs are append-only.** Corrections happen via adjustment Costs, never edits.
- **Every Cost references a Commitment.** If no real commitment exists, a retroactive one is created (possibly to oneself). This preserves the invariant that committed state always explains spending.
- **Every Cost references a Scope.** Scope is the *where*. Activity is the *what kind*.
- **Scope is the tech spec.** Materials (SKUs) and install notes live on the scope, not on commitments. Nested per-job tree.
- **Activity is server-level taxonomy.** Shared across jobs and projects.
- **Patches are content-addressed groups of commitment edits.** Commitment state = fold(patches). Costs are not patched.
- **Documents are content-addressed and first-class.** Ingested files (invoices, plans, lien waivers, photos) get a `Document` row keyed by sha256. Identical bytes dedupe. Documents may be job-scoped or project-scoped.
- **`apply_patch` is the sole commitment mutation API.** No `create_commitment` sugar verb. See [TOOLS.md §3.2](TOOLS.md). Reasoning: single mutation path is easier to reason about, test, and extend.
- **Projects are thin in v1.** `{ id, name, slug }`. Commitments live on jobs, not projects. Contract roll-down from project → job is deferred.
- **Plans + Options deferred.** Schema has slots (`spec.planRef`, `spec.optionRef`) but no UI.

---

Open questions about the schema live in [docs/product/backlog.md](docs/product/backlog.md). SPEC is the contract; the backlog is the tracker.
