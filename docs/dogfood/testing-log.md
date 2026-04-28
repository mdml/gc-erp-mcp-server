# Testing log

Append-only log from dogfooding the deployed MCP server during development pauses. See [CLAUDE.md](CLAUDE.md) for how entries get written and triaged.

## 2026-04-20 — pause begins (post-M3 deploy)

### What I did
- Deployed M3 (cost-entry form + Clerk OAuth) to prod at `gc.leiserson.me` via `turbo run deploy`. PR #39 merged at 16:26 UTC. Entering a multi-day dogfood pause to build product intuition before M4 kickoff.

### Next-session tasks
- *(nothing yet — Max calls when the pause ends)*

## 2026-04-20 — dogfood session: kitchen-remodel walkthrough (create → CO)

Ran a full [TOOLS §6](../../TOOLS.md) walkthrough against the deployed M3 MCP via claude.ai's MCP connector (`mcp__claude_ai_GC_ERP__*`). Goal: probe the data model, not natural-language ergonomics — explicit prompts, watch what the agent + server do. Raw scope tree snapshot saved at [`docs/dogfood/tree.json`](tree.json) (clean up later).

*(2026-04-28 — Triaged: Next-session tasks → ABSTRACTIONS guide seeded at [`docs/guides/ABSTRACTIONS.md`](../guides/ABSTRACTIONS.md); ID-invariant decision and tool-description polish routed to [`backlog.md`](../product/backlog.md). What surprised me → 10 dated one-liners appended to [`retros/draft.md`](../retros/draft.md). Questions / ideas → 11 new entries in `backlog.md` §"Data model / schema", 1 in §"Patches / event sourcing", and 4 vision questions seeded as a new §"System topology". `tree.json` cleanup still pending.)*

### What I did

- **Party / project / job:** created Nick Richards as a party, then a project ("Nick Richards Kitchen Remodel") + job ("Kitchen Remodel – 123 Governor St") with May 4 start date.
- **Scope tree (14 nodes):** Kitchen root + 11 children, with one-level nesting on Electrical (Rough/Trim), Plumbing (Rough/Trim), Cabinets (Base/Wall). Set `spec` on Cabinets: `{ materials: [{sku: "IKEA-BODBYN-W-30", quantity: 4}], installNotes: "soft-close" }`.
- **First commitment:** Rogelio's Framing LLC, $8,500 lump, three activations — `lumber_drop` ($500/Demo), `frame` ($7,000/Framing), `punch` ($1,000/Demo). Via `apply_patch` with one `op: "create"` edit.
- **First NTP:** on the `lumber_drop` activation, issuedOn 2026-04-27. Derived startBy=2026-05-04, finishBy=2026-05-05.
- **First cost:** $480 invoice LY-7791 from Rogelio, against the `lumber_drop` activation on Demo, via `record_cost`.
- **Direct cost:** $120 lumberyard card swipe for bracing hardware against Framing, via `record_direct_cost`. Atomic self-commitment + self-party creation for Max.
- **Change order #1:** pantry framing added to Rogelio's contract — one `apply_patch` with two edits (`addActivation` $900 + `setPrice` $8,500 → $9,400), atomic.
- **Final rollup verified:** Kitchen $9,520 committed / $600 cost; Demo $1,500 / $480; Framing $8,020 ($7,000 Rogelio + $900 pantry + $120 self) / $120 cost. MxN join + scope tree fold validated end-to-end.

### What surprised me

- **Project grain drift.** Agent named the project "Nick Richards Kitchen Remodel" — collapsing client + work-type into the project name, unlike TOOLS §6's `project=property` convention (project="Main St Remodel", job="Kitchen"). `create_project`'s tool description doesn't prescribe project=property. If a second reno at the same property comes along later, the chosen grain doesn't scale cleanly.
- **Caller-supplied IDs in `apply_patch` violate the `<prefix>_<nanoid21>` invariant silently.** Agent invented `cmt_rogelios-framing-001`, `act-a_lumber-drop`, `act-b_frame`, `act-c_punch`, later `act-d_pantry-frame`. Server accepted verbatim because [`ids.ts:5-9`](../../packages/database/src/schema/ids.ts) documents runtime validation as "non-empty string" by design — the `cm_<nanoid21>` shape is a generator convention, not a validator rule. Prod D1 now has permanently ugly IDs. Server-generated paths (`record_cost`, `record_direct_cost`, `create_party`) are all clean — the leniency is localized to caller-supplied IDs, which `apply_patch` requires for content-addressed patch hashing determinism.
- **Working-days semantics is load-bearing but hidden.** Initial prediction of startBy used calendar-math and was off by 2 days. Model uses Mon–Fri working days per [`common.ts:31`](../../packages/database/src/schema/common.ts) docstring, via `addWorkingDays` in [`issue_ntp.ts:74`](../../apps/mcp-server/src/tools/issue_ntp.ts). `issue_ntp`'s tool description says "startBy = issuedOn + activation.leadTime" without mentioning working-days. Agent rendered "5-day lead" in its summary — similarly ambiguous to an operator reading the table.
- **No holiday calendar.** [`_working-days.ts:3`](../../apps/mcp-server/src/tools/_working-days.ts) is explicit: "Mon–Fri; no holiday calendar." Memorial Day, July 4th, Labor Day all count as working days. Systematic bias toward earlier finish dates than reality for US-based subs.
- **Agent blind to self-commitment in rollup predictions — twice.** After `record_direct_cost` the agent said Framing had "$120 cost alongside $7,000 committed" (missing the self-commitment's $120 contribution; actual $7,120). After CO #1 the agent said Framing committed "reflects $7,900 from Rogelio" (actual Framing total $8,020 including the self $120). The $120 self-commitment is cognitively invisible to the agent when predicting totals from memory.
- **Agent reasons sharply from data, loosely from memory.** Three instances — (1) agent self-surfaced the "should direct costs inflate committed?" design question once the tree showed $7,120; (2) the two rollup mispredictions above, both self-corrected after pulling `get_scope_tree`; (3) final CO summary correctly stated "$7,000 + $900 + $120, all rolled up correctly" only after seeing the numbers. Pattern for future skill design: put tool output back in front of the agent *before* asking it to reason about totals.
- **Agent confabulation blurs display vs. storage.** `cmt_rogelios-framing-001` in display tables looked like a prettification, but the agent had actually passed that string through as the stored ID. The line between "readable summary" and "real stored ID" blurred in the agent's own reasoning.
- **`spec` is invisible in `get_scope_tree` output.** `ScopeNode = { id, name, parentId?, committed, cost, variance, children }` — no `spec`, no `code`. Cabinets' IKEA-BODBYN spec round-trips via `list_scopes` but disappears in the dashboard-shaped tree. Reasonable split, but any future scope-detail UI needs to stitch both tools client-side.
- **Agent didn't verify via `get_scope_tree` after writes.** Multiple times predicted the tree shape instead of calling the read tool. Inferring vs. verifying — if fold logic ever drifts, silent inference misses it.
- **Tool-loading friction for `apply_patch`.** Agent announced "First I need to load the `apply_patch` tool" — deferred-tool-loading in claude.ai's MCP connector. Minor friction, worth noting when thinking about tool-surface ergonomics across clients.

### Questions / ideas

**Data-model gaps (schema forks to resolve):**

- **Project = property vs. free-form naming.** Enforce convention in `create_project` description, or leave open and accept per-operator drift. Multi-job-per-property scenarios don't fit the free-form shape.
- **Bids aren't a first-class entity.** Commitments have `signedOn`; no "pending bid" state. Fork: add `Bid` entity, add a state field on Commitment, or keep "commitments = signed contracts" and use external tooling for pre-signed tracking.
- **Activation dependencies.** No `dependsOn`/`predecessors` field on Activation; can't derive gantt or critical path. Needed for schedule visualization.
- **Approvals / lien waivers.** TOOLS §5.3 names `lien_waiver_tracker` as an M5+ MCP app, but no entity for how lien waivers relate to commitments / activations / costs. Needs schema, not just a UI.
- **Client-side ledger (upstream).** Only model downstream (what we owe subs) today. Missing: what clients owe us — receivable commitments, pay-app events. "Eating a sub cost" vs. "passing through with markup" is an inter-ledger artifact that's currently unrepresentable. Two paths: `direction: payable | receivable` on Commitment (minimal change, forced symmetry), or separate `ClientAgreement`/`Sale` entity (different shape — pay schedules/milestones/retainage don't map cleanly to activations).
- **Scope templates / per-project reuse.** `scopes.jobId` is NOT NULL; every job rebuilds its tree from scratch. Fork: templates-as-clones (`clone_scopes({fromJobId, toJobId})`, or `ScopeTemplate` entity) or promote Scope to project level (deeper change — breaks "scope belongs to a job" invariant).
- **CSI codes.** `scopes.code` is free-form text, no FK, no enum. Either add `CsiCode` lookup table + FK, Zod `.refine(/^\d\d \d\d \d\d$/)`, or leave free-form by intent.
- **ScopeSpec vocabulary.** Currently closed (`materials`, `installNotes`, `planRef`, `optionRef`); Zod silently strips unknown keys. Fork: keep closed for consistency, or open via `.passthrough()` or an `extras` field for flexibility.
- **Progress / % complete per activation.** No `activation.state` or `activation.progress` field. Partly in existing backlog as "% complete on pay apps" ([`backlog.md:11`](../product/backlog.md)) but applies per-activation too. Without it, can't distinguish "activation completed under-budget" from "activation not yet started."
- **Realized vs. unrealized variance.** `committed − cost` is a single number that conflates "activation under-ran (genuine favorable variance)" with "activation hasn't started (just unrealized commitment)." Scope rollup flattens both into one variance figure.
- **Self-commitment rollup semantics.** Self-commitments contribute to `committed` same as sub commitments. Conceptually a self-commitment is "already paid, no future obligation" — not really "committed." Also: direct costs are always variance-neutral by construction (`record_direct_cost` inflates committed by exactly the cost amount), so variance tracking goes blind on them. Fork: add `selfFunded` flag excluded from committed rollup, or keep uniform and teach UI to render differently.
- **Self-party / counterparty dedup.** No canonical `selfPartyId` on Job — every `record_direct_cost` in a new session could create duplicate "Max" parties. Candidate: `Job.selfPartyId` field, or dedup hint in `create_party`'s description.

**Tool-surface clarity:**

- **ID permissiveness in `apply_patch`.** Three paths: (a) tighten validator to `.regex(/^cm_[A-Za-z0-9_-]{21}$/)` etc. (breaks existing D1 rows, has migration cost); (b) server-generate on `op: "create"` before hashing (changes the contract); (c) keep permissive, document convention in tool description (cheap, leaky). Needs an ADR.
- **Working-days semantics in `issue_ntp` description.** Add "(working days, Mon–Fri)" to the derivation line so agents render "+5 working days" not "+5-day lead."
- **Starter activity library discoverability.** Agent goes straight to `ensure_activity` without checking `list_activities`. Add hint in `ensure_activity` description — "check `list_activities` first to avoid re-upserting slugs in the 22-item starter library."
- **`parentPatchId` required for non-create edits.** Every change order is by definition derived from a prior patch — the field exists for provenance. Consider requiring it for any `apply_patch` where edits include non-`create` ops.

**System topology — 4 vision questions (from Max):**

- **Agent topology.** Single general-purpose agent (on-demand, broad context) vs. specialized skills (on-demand, narrow) vs. scheduled intelligence (cron-initiated, no user). Per-capability question. E.g., "process bids from inbox" likely scheduled; "draft a change-order response" on-demand-general; "issue NTP" could be a scheduled-skill + operator-attestation MCP app.
- **Integration ownership.** Us-as-integrator (we host `send_lien_waiver` API + status webhooks — predictable, auditable) vs. Claude-as-orchestrator (we expose data + verbs; Claude stitches Gmail + DocuSign + our MCP — flexible, no API maintenance). MCP-first ethos leans toward orchestration, but audit-critical flows (payments, lien-waiver status) may need us-as-integrator for reliability/traceability.
- **External-party UX.** Subs and clients don't have Claude Desktop. Inbound rides on the channels they *do* have — email, SMS, web. Fork: build-custom-forms (lightweight web app + form builder), integrate-existing (Notion DBs, Google Forms, DocuSign), or email-only degenerate. Processed inbound → scheduled-skill pattern from the agent-topology question.
- **Operator UX split (MCP apps vs. web app).** MCP apps strong for attestation (the click *is* the product, per the M3 pattern); weak for scanning-across-rows (dashboards, bulk edits, filtering). Read-only web app paired with attesting MCP apps may be the right split. Existing specced apps (`job_dashboard` M4, `pay_app_preview` M5 in TOOLS §5.3) are all MCP apps — worth reconsidering whether dashboard shape fits the MCP-app form factor.
- **All four interact.** E.g., lien-waiver status as a scheduled skill, stitching external MCPs, kicked off by sub-submitted forms, with operator-attestation MCP app for approval. Not independent decisions; candidate for an "architecture notes" doc sketching the interactions.

### Next-session tasks

- **Seed [`docs/guides/ABSTRACTIONS.md`](../guides/)** with the MxN-join + "activation is the atomic unit of work" framing. Max flagged this explicitly during the session — the scope/commitment/activation model is load-bearing and currently only reachable via reading SPEC + TOOLS + ADRs. Worth a clean guide as product + data-model context.
- **Tool-description polish pass.** Working-days in `issue_ntp`; starter-library hint in `ensure_activity`; project=property convention hint in `create_project`; ID-shape hint in `apply_patch`.
- **Decide the ID-invariant path.** Prod D1 now has `cmt_rogelios-framing-001` and friends. Option (a) validator-tighten has a data-migration cost; (b) server-generate on create changes the `apply_patch` contract; (c) describe-and-pray is cheap but leaky. Pick one and write an ADR.
- **Clean up [`docs/dogfood/tree.json`](tree.json).** Saved during the session for reference; ephemeral and gitignorable once triaged.
