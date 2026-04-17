# TOOLS.md — MCP tool + app contract

> Companion to [SPEC.md](SPEC.md). SPEC is the *data model* (Zod types + invariants). This file is the *verb surface* — tools, apps, and the scenarios that drive TDD.
>
> Status: **landing incrementally.** §2 `Document` schema landed in [SPEC.md §1](SPEC.md) alongside the M1 database package. §3 tool surface is in progress per [`now.md`](docs/product/now.md). Decisions this file depends on are recorded in [ADR 0003](docs/decisions/0003-storage-split.md) (D1 + R2 + DO-session-only). Schema forks resolved in §8.

---

## 1. Conventions

- **Names are `snake_case`.** Verb-first (`create_job`, `list_commitments`, `issue_ntp`). Matches the existing `ping` / `list_jobs` scaffold.
- **One tool per file** under `packages/mcp-server/src/tools/<name>.ts`. Each module exports `{ name, description, inputSchema, outputSchema, handler }`. Zod schemas give us runtime validation, TypeScript types, and MCP JSON Schema for free.
- **Read vs write split.** Read tools are safe to call repeatedly; write tools mutate D1 and/or R2. Claude will compose them — read to gather context, write to commit.
- **Errors are structured.** Handler throws `McpToolError(code, message, details)`. Codes: `not_found`, `invariant_violation`, `validation_error`, `dependency_missing`. The MCP client sees `isError: true` on the tool result; Claude is trained to read the text.
- **Every write tool is idempotent where possible.** `ensure_activity({ slug })` returns the existing row if present; `issue_ntp` creates a new event (NTPs aren't idempotent by design — re-issuing *is* the semantic).
- **Tests colocate.** `create_commitment.ts` → `create_commitment.test.ts`. Pure-logic tests for schema + invariant; integration tests use an in-memory MCP client pair against a fresh D1 (Miniflare).

---

## 2. `Document` schema

**Landed.** Zod shape + invariants live in [SPEC.md §1](SPEC.md) (`Document`, `DocumentId`, and the `documentId: DocumentId.optional()` field on each `CostSource` variant). Drizzle table + `documentIdFor(sha256)` helper in [`packages/database/src/schema/documents.ts`](packages/database/src/schema/documents.ts). The write-side tools (§3.4) that exercise this schema are still pending — they couple with R2 binding + content-hash verification and land as their own slice.

Forks resolved before landing (kept here as trail of reasoning):

1. `jobId` is **optional** — project-level docs (insurance, architect's set) are first-class. "All docs for a job" is a join through `Cost.source.documentId` + direct `Document.jobId` matches.
2. Tags are **free-form strings** for v1. Seed set: `invoice`, `plan`, `contract`, `receipt`, `photo`, `lien_waiver`. Closed enum is a post-POC decision.
3. **Versioning is deferred.** Corrected invoice = new sha256 = new row. A `supersedes: DocumentId.optional()` linkage lands if/when duplicate-by-vendor patterns become painful enough to hand-link manually.

---

## 3. Write tools

Every tool listed here gets a Zod `inputSchema` referencing SPEC.md §1 types (e.g. `jobId: JobId`). Handler returns the full created/updated entity (JSON, serialized in the MCP `content[0].text`).

### 3.1 Entities — CRUD

| Tool | Inputs (sketch) | Output | Notes |
|---|---|---|---|
| `create_project` | `{ name, slug }` | `Project` | Slug unique across server. |
| `create_job` | `{ projectId, name, slug, address?, clientPartyId?, startedOn? }` | `Job` | Slug unique within project. |
| `create_scope` | `{ jobId, parentId?, name, code?, spec? }` | `Scope` | `parentId` must resolve to a scope with the same `jobId`. No cycles. |
| `update_scope` | `{ scopeId, fields: Partial<Scope> }` | `Scope` | Can't change `jobId` or `parentId` to a different-job scope. |
| `create_party` | `{ kind, name, email? }` | `Party` | Person or org. Used for subs, clients, self. |
| `list_activities` | `{ query?: string }` | `Activity[]` | Server-wide library. `query` does substring match on name/slug. |
| `ensure_activity` | `{ slug, name, defaultUnit? }` | `Activity` | Returns existing if slug matches, else creates. |

### 3.2 Commitments + schedule

| Tool | Inputs | Output | Notes |
|---|---|---|---|
| `apply_patch` | `{ jobId, parentPatchId?, message, edits: CommitmentEdit[] }` | `Patch` | **The only commitment mutation API.** Create, price-change, activation add/edit/remove, void — all via `edits`. Atomic apply or error. Content-addressed id. |
| `issue_ntp` | `{ activationId, issuedOn, siteReady, note? }` | `NTPEvent` (+ derived `startBy`, `finishBy`) | Multiple NTPs per activation allowed; latest wins. Not a Patch — NTP is event-log separate from commitment state. |

**No sugar verbs for commitments.** An earlier draft proposed `create_commitment` as syntactic sugar wrapping a single-edit Patch. Rejected in favor of a uniform power-tool surface: every commitment mutation is an `apply_patch` call with one or more `CommitmentEdit` entries. Reasoning: (a) single mutation path is easier to reason about and test; (b) one commitment-edit API is easier for Claude to master than five sugar tools; (c) as models improve, composing `edits` arrays is trivially in-scope.

**Common patterns** (operational guidance for Claude, not separate tools):

- New commitment → `apply_patch({ edits: [{ op: "create", commitment: { ... } }] })`.
- Change order adding an activation + adjusting another commitment's price → one patch, two edits (atomicity: both land or neither).
- Voiding a commitment → `apply_patch({ edits: [{ op: "void", commitmentId, reason }] })`.

### 3.3 Costs

| Tool | Inputs | Output | Notes |
|---|---|---|---|
| `record_cost` | `{ jobId, scopeId, commitmentId, activityId, activationId?, counterpartyId, amount, incurredOn, source, memo? }` | `Cost` | Append-only. All invariants from SPEC §1 enforced. |
| `record_direct_cost` | `{ jobId, scopeId, activityId, counterpartyId, amount, incurredOn, source, memo? }` | `{ cost, commitment, patchId }` | Shortcut for Day-18 "I swiped my card at the lumberyard." Auto-creates a self-commitment (lump, single activation, zero leadTime/buildTime) in a new Patch, then records the Cost against it. Kept as a tool (not pure sugar) because the commitment + cost must be atomic — two separate tool calls can orphan a commitment if the sequence is interrupted. Caller must pass `activityId` explicitly (typically `materials_direct` or `labor_tm`); no inference from `source.kind`. |

### 3.4 Documents

| Tool | Inputs | Output | Notes |
|---|---|---|---|
| `store_document` | `{ content: base64, mimeType, filename, jobId?, tags? }` | `Document` | **Inline path** — for small files (< 5 MB; MCP client-dependent). Worker computes sha256, PUTs to R2 at `documents/<sha256>`, inserts row (or returns existing if sha256 matches). |
| `request_upload` | `{ mimeType, filename, sizeBytes, jobId?, tags? }` | `{ uploadId, putUrl, headers, expiresAt }` | **Pre-signed path** — for large files. Returns a time-limited R2 PUT URL. The MCP App PUTs directly, then calls `finalize_upload`. |
| `finalize_upload` | `{ uploadId, sha256 }` | `Document` | Server inspects R2 object, verifies sha256, creates `Document` row. Errors if the uploaded object's hash doesn't match (tamper detection). |
| `get_document` | `{ documentId }` | `{ document, downloadUrl }` | Short-TTL signed GET URL for MCP apps to display. |

---

## 4. Read tools

| Tool | Inputs | Output | Notes |
|---|---|---|---|
| `get_job` | `{ jobId }` | `{ job, project, rootScope }` | Shallow — for "what am I looking at" orientation. |
| `get_scope_tree` | `{ jobId }` | `ScopeNode[]` (tree) with rolled-up `{ committed, cost, variance }` per node | Drives the dashboard view, but useful earlier for Claude to answer "how much is kitchen demo tracking?" |
| `list_commitments` | `{ jobId, counterpartyId?, scopeId? }` | `Commitment[]` | Filters are AND-combined. |
| `list_costs` | `{ jobId, scopeId?, commitmentId?, activityId?, since?, until? }` | `Cost[]` | |
| `list_documents` | `{ jobId?, tags?: string[] }` | `Document[]` | `tags` match ANY of the listed tags. |
| `get_schedule` | `{ jobId }` | `ScheduleRow[]` (one per activation with latest NTP + derived `startBy`, `finishBy`, `actualFinish?`, `variance?`) | Derived from commitments + NTP events. |
| `list_jobs` | `{}` | `Job[]` | Already scaffolded; currently returns `[]`. |

---

## 5. Apps (MCP UI components)

Each app is an MCP App per the [Apps extension spec](https://modelcontextprotocol.io/extensions/apps/overview) — a sandboxed web view rendered by the MCP client, invoked by a tool result.

### 5.1 `cost_entry_form` — M3

**Invoked from:** `record_cost` (and `record_direct_cost`) when called with a `draft: true` flag, or when Claude needs operator confirmation on parsed-from-invoice data.

**Props:** `{ draftCost, document?, resolved: { scope, commitment, activity, counterparty } }`.

**UX:**
- Left pane: rendered document (iframe of signed R2 GET URL) if `document` present.
- Right pane: editable fields — scope picker, commitment picker (filtered to commitments matching the scope), activity picker, counterparty, amount, incurred-on, memo.
- Confirm button → calls `record_cost` via the MCP protocol's `sampling` channel (app talks back to server).
- Cancel button → returns control to Claude with "discarded."

**Why this first:** it's the highest-leverage interaction in the whole product. Invoice in → cost out is the loop that repeats every week of a job.

### 5.2 `upload_document` — M3

**Invoked from:** `request_upload` tool returning `{ needsAppUpload: true }`, or surfaced as a button inside `cost_entry_form` when no document is attached.

**UX:**
- `<input type="file">` + drag-drop zone.
- Computes sha256 client-side (WebCrypto).
- PUTs to the pre-signed URL from `request_upload`.
- Calls `finalize_upload` to register the `Document`.
- Emits `{ documentId }` back to the host chat.

### 5.3 Deferred (M4+)

- `job_dashboard` (M4) — scope tree with committed/cost/variance, active NTPs, schedule gantt.
- `pay_app_preview` (M5) — G702/G703 renderer, approval flow, PDF export.
- `lien_waiver_tracker` (M5+) — per-pay-app waiver status.

---

## 6. Scenarios — kitchen remodel as test fixture

SPEC §2's narrative, translated to a tool-call sequence. Each `Day N` block is one integration test; the whole file is one end-to-end test. Assertions (not shown) check: state after each call, invariants, derived values.

### Day 0 — scaffold

```
create_project({ name: "Main St Remodel", slug: "main-st" })
  → { id: p_main }

create_job({ projectId: p_main, name: "Kitchen", slug: "kitchen", address: "123 Main St" })
  → { id: j_kitchen }

create_scope({ jobId: j_kitchen, name: "Kitchen" })                            → s_kitchen (root)
create_scope({ jobId: j_kitchen, parentId: s_kitchen, name: "Demo" })          → s_demo
create_scope({ jobId: j_kitchen, parentId: s_kitchen, name: "Framing" })       → s_framing
create_scope({ jobId: j_kitchen, parentId: s_kitchen, name: "Electrical" })    → s_elec
... (and so on — cabinets, countertops, backsplash, paint, punch)

update_scope({ scopeId: s_cabinets, fields: { spec: { materials: [{ sku: "IKEA-BODBYN-W-30", quantity: 4 }], installNotes: "Soft-close, level to countertop template" } } })
```

Assertions:
- `get_scope_tree({ jobId: j_kitchen })` returns the tree with root = Kitchen, children in insertion order, all `committed: 0, cost: 0`.

### Day 3 — first commitment

```
create_party({ kind: "org", name: "Rogelio's Framing LLC" })
  → party_rogelio

# activity library is pre-seeded with these; ensure_activity is a no-op:
list_activities({ query: "lumber" })   → [act_lumberDrop]
list_activities({ query: "frame" })    → [act_frame]
list_activities({ query: "punch" })    → [act_punch]

apply_patch({
  jobId: j_kitchen,
  message: "Rogelio framing contract",
  edits: [{
    op: "create",
    commitment: {
      id: c_frame,
      jobId: j_kitchen,
      scopeIds: [s_demo, s_framing],
      counterpartyId: party_rogelio,
      price: { kind: "lump", total: { cents: 850_000, currency: "USD" } },
      activations: [
        { id: a_drop,  activityId: act_lumberDrop, pricePortion: { cents:  50_000 }, leadTime: { days: 5 }, buildTime: { days: 1 } },
        { id: a_frame, activityId: act_frame,      pricePortion: { cents: 700_000 }, leadTime: { days: 3 }, buildTime: { days: 3 } },
        { id: a_punch, activityId: act_punch,      pricePortion: { cents: 100_000 }, leadTime: { days: 0 }, buildTime: { days: 1 } },
      ],
      signedOn: "2026-04-18",
    },
  }],
})
  → Patch { id: P1, parentPatchId: undefined }
```

Assertions:
- Invariant: `sum(pricePortion) == price.total` ✓
- `get_scope_tree`: Kitchen.committed = $8,500; Demo.committed = $1,500 (drop + punch); Framing.committed = $7,000.

### Day 10 — NTP

```
issue_ntp({ activationId: a_drop, issuedOn: "2026-04-27", siteReady: true })
  → NTPEvent { id: n1, startBy: "2026-05-04", finishBy: "2026-05-05" }
```

### Day 14 — first cost (with document)

```
# Option A: inline (invoice is a small PDF)
store_document({ content: <base64>, mimeType: "application/pdf", filename: "LY-7791.pdf", jobId: j_kitchen, tags: ["invoice"] })
  → Document { id: doc_abc, sha256: "abc..." }

record_cost({
  jobId: j_kitchen,
  scopeId: s_demo,
  commitmentId: c_frame,
  activityId: act_lumberDrop,
  activationId: a_drop,
  counterpartyId: party_rogelio,
  amount: { cents: 48_000, currency: "USD" },
  incurredOn: "2026-05-04",
  source: { kind: "invoice", invoiceNumber: "LY-7791", receivedOn: "2026-05-04", documentId: doc_abc },
})
  → Cost { id: cost_1 }
```

Assertions:
- `list_costs({ jobId })` returns exactly one row.
- `get_scope_tree`: Demo.cost = $480; Demo.variance = $1,020.

### Day 18 — direct materials escape hatch

```
record_direct_cost({
  jobId: j_kitchen,
  scopeId: s_framing,
  activityId: act_materials_direct,   # or created via ensure_activity on first use
  counterpartyId: party_max,
  amount: { cents: 12_000 },
  incurredOn: "2026-05-01",
  source: { kind: "direct", note: "bracing hardware, lumberyard" },
})
  → { cost: cost_2, commitment: c_self_hw, patchId: P2 }
```

Assertions:
- New self-commitment exists with `counterpartyId = party_max`, single activation zero-lead/build.
- Cost references it.
- Scope tree rolls up correctly.

### Day 60 — change order via `apply_patch`

```
apply_patch({
  jobId: j_kitchen,
  parentPatchId: P6,
  message: "CO #1: add pantry",
  edits: [
    { op: "addActivation", commitmentId: c_frame,
      activation: { activityId: act_frame, pricePortion: { cents: 90_000 }, leadTime: { days: 2 }, buildTime: { days: 1 } } },
    { op: "setPrice", commitmentId: c_cabinets, price: { kind: "lump", total: { cents: 1_420_000 } } },
  ],
})
  → Patch { id: P7, parentPatchId: P6 }
```

Assertions:
- P7 id equals `hash(P6, edits, createdAt)`.
- Folding P1..P7 yields the expected commitment state.
- `get_scope_tree` reflects the new pantry activation in Framing.committed.

---

## 7. Starter activity library

Seeded on first boot via a dev-tools script (`packages/dev-tools/src/seed-activities.ts`, planned). Initial set covers the kitchen narrative + common adjacent work:

| Slug | Name | Default unit |
|---|---|---|
| `lumber_drop` | Lumber Drop | — |
| `frame` | Frame | lf |
| `demo` | Demolition | — |
| `electrical_rough` | Electrical Rough-in | — |
| `electrical_trim` | Electrical Trim | — |
| `plumbing_rough` | Plumbing Rough-in | — |
| `plumbing_trim` | Plumbing Trim | — |
| `drywall_hang` | Drywall Hang | sqft |
| `drywall_finish` | Drywall Finish | sqft |
| `paint` | Paint | sqft |
| `cabinet_delivery` | Cabinet Delivery | — |
| `cabinet_install` | Cabinet Install | — |
| `countertop_template` | Countertop Template | — |
| `countertop_install` | Countertop Install | sqft |
| `backsplash` | Backsplash | sqft |
| `appliance_delivery` | Appliance Delivery | — |
| `appliance_install` | Appliance Install | — |
| `flooring` | Flooring | sqft |
| `tile` | Tile | sqft |
| `punch` | Punch List | — |
| `materials_direct` | Materials (Direct) | — |
| `labor_tm` | Labor (T&M) | hr |

New activities land via `ensure_activity` as the project surfaces them. The seed list is the "80% case" starting point, not a closed taxonomy.

---

## 8. Resolved forks

Kept as a trail of reasoning; the substance has moved into the relevant section.

1. **`Document` schema** — `jobId` optional; tags free-form strings; versioning (`supersedes`) deferred. Landed in [SPEC.md §1](SPEC.md); see §2 for the fork trail.
2. **Commitment mutation API** — `apply_patch` is the sole commitment mutation tool; no `create_commitment` sugar. Uniform surface over more tools. (§3.2.)
3. **`record_direct_cost` activity** — caller passes `activityId` explicitly; no inference from `source.kind`. (§3.3.)
4. **Starter activity library** — seeded on first boot; 22-item list in §7 is the v1 seed. Adjustable by editing the seed module before first boot; after first boot, additions happen via `ensure_activity`.
5. **Starter activity library (and schema + migrations) location** — `packages/database` (not `dev-tools`). See §10.
6. **MCP App upload fallback** — deferred. Primary clients (Claude Desktop, web, mobile) support apps; CLI-only operators fall back to inline `store_document` within payload size limits.

---

## 9. Doc lifecycle

- **SPEC.md** is the source of truth for *types*. For the `Document` schema see [SPEC.md §1](SPEC.md) (`Document` + `CostSource.documentId`); §2 here carries only the fork trail.
- **This file** is canonical for *verbs* (tool names, inputs, outputs, scenarios). Update in the same PR that lands or changes a tool.
- **Per-tool implementation docs** live as Zod schemas + JSDoc on each `packages/mcp-server/src/tools/<name>.ts` module. The JSDoc is what the MCP client sees at `tools/list` time. This file is orientation; the code is the machine-readable contract.

---

## 10. Schema, migrations, seeds — `packages/database`

Lands alongside M1. One package to own the data layer.

```
packages/database/
├── src/
│   ├── schema/              # drizzle schema (runtime — imported by mcp-server)
│   │   ├── jobs.ts
│   │   ├── parties.ts
│   │   ├── scopes.ts
│   │   ├── activities.ts
│   │   ├── commitments.ts
│   │   ├── patches.ts
│   │   ├── ntp-events.ts
│   │   ├── costs.ts
│   │   ├── documents.ts
│   │   └── index.ts
│   ├── client.ts            # typed drizzle-D1 client factory (runtime)
│   ├── migrations/          # drizzle-kit generated SQL (applied via wrangler d1 migrations apply)
│   └── seed/                # one-shot scripts — never bundled into runtime
│       ├── activities.ts    # the 22-item starter library (§7)
│       └── run.ts
├── drizzle.config.ts
└── package.json
```

Why a dedicated package instead of folding into `mcp-server` or `dev-tools`:

- **One source of truth for the schema.** `drizzle-kit` reads schema to generate migrations; mcp-server imports the same schema for typed queries; seed scripts import it too. Defining it in three places is a maintenance hazard.
- **Runtime / tooling split inside the package.** `src/schema/` and `src/client.ts` are runtime (imported into the Worker bundle). `src/migrations/` is SQL on disk, applied by wrangler at deploy time. `src/seed/` is tooling — seed scripts run outside the Worker (via `bun run`) against dev or prod D1.
- **Not `dev-tools`.** Dev-tools owns local dev-env machinery (secrets sync, gate runner). Schema + migrations + seeds are production artifacts, not dev-env machinery.
- **Not `mcp-server`.** mcp-server is the runtime. Keeping schema out of it means the schema can be used by future packages (e.g. a QuickBooks exporter, a pay-app PDF generator) without circular deps back into the Worker.
- **Not `fixtures`.** Fixtures are test data. The starter activity library is production seed data — it lands in prod on first deploy. Test fixtures (kitchen-remodel integration test) live next to their tests.

New package checklist (per [packages/CLAUDE.md](packages/CLAUDE.md)) applies — including `packages/database/CLAUDE.md` describing the boundary between runtime (schema, client) and tooling (migrations, seeds).
