# Scope 3 — Schedule dependencies

**Why 3:** Unlocks the biggest open questions on UI. Without `Activation.dependsOn`, there's no critical path, no real gantt, no schedule-shape visualization. The dashboard work that was M4 in the old milestone plan is gated on dependencies — without them, "what's slipping?" can only be answered per-activation, not project-wide. Forcing this scope also forces the MCP-app-vs-web-app decision for the dashboard, which has been the longest-lingering UX question.

## What this scope is

Make the schedule a real DAG. Today an activation has a `leadTime` and a `buildTime`; once an NTP is issued, `startBy` and `finishBy` derive from `issuedOn`. There's no way to express "this activation can't start until that one finishes." Add dependencies, the math that uses them (critical path, slack, derived earliest-start), the events that close the loop (`DelayEvent`, activation closure), and the holiday calendar that makes working-days math honest. Then build the schedule UI — and decide whether it's MCP-app-shaped or web-app-shaped.

Two distinct kinds of work bundled here: **schema and math** (additive, well-bounded) and **schedule UI** (the cross-cutting UX-split decision lands here).

## In

- **Schema.** `Activation.dependsOn: ActivationId[]` — predecessor list; cycle prevention at write time; transitive close for query.
- **Critical-path math.** Longest path through the DAG; per-activation slack; derived earliest-start (max over predecessor finishes) overrides the NTP-based `startBy` when predecessors haven't finished yet.
- **`DelayEvent` schema** (already in `backlog.md` and now folded here). Three-event activation lifecycle: `NTPEvent` (already exists) → optional `DelayEvent`s (FK to activation; `cause ∈ {weather, site_block, owner_delay, sub_delay, other}`, `startedOn`, `endedOn?`, `note?`) → activation-closure event (actual finish, enables variance math). `finishBy = startBy + buildTime + sum(delay durations)`.
- **`siteReady` superseded.** ADR 0007 dropped the boolean `siteReady` flag in favor of the eventual `DelayEvent` shape — that work lands here. A zero-duration `DelayEvent` with `cause: site_block` at NTP issue time replaces the flag.
- **Activation state lifecycle.** NTP'd → started → finished (closed). State changes are derived from events (`NTPEvent` → NTP'd, etc.) — append-only, projection-shaped, consistent with the existing patches model. State enables the realized-vs-unrealized variance work [scope 1](1-client-ledger.md) needs.
- **Holiday calendar.** Mon–Fri-only treats Memorial Day, July 4, Labor Day as working days — systematic earlier-finish bias. Add a holiday list (US federal default + per-job overrides for sub-specific calendars); plug into `addWorkingDays`.
- **Schedule UI.** Whatever shape the operator-UX-split decision lands on. Likely a small read-only web view served by the same Rust binary (gantt, critical-path-highlighted, slip indicators), with attesting MCP apps for "approve NTP" / "log delay" actions. Forces the decision.
- **Commitment label disambiguation in dashboards.** When a job has two commitments from the same counterparty, today's bare `counterparty.name` label is ambiguous. Pick a tie-breaker (price summary, primary scope, explicit `Commitment.label`).

## Out

- **Resource leveling.** Not in v1. Single-resource-per-activation is the simplification.
- **Multi-job scheduling.** Per-job DAG only. Cross-job dependencies (e.g. "punch list waits on a property-level inspection") deferred.
- **Mobile / push notifications for schedule slips.** Future; this scope ships the data + a desktop view.
- **Auto-scheduling / what-if planning.** Pure read of current state; no scenario branching.
- **Resource calendars per sub.** Per-sub holiday lists could land here, but defer; one global holiday list with per-job override is enough for v1.

## Open questions

- **MCP app vs web app for the schedule UI.** The cross-cutting design question this scope forces. MCP apps are attestation-shaped (a click *is* the product, per the M3 pattern); dashboards are scanning-shaped (rows, filters, sort). Three options:
  - Pure MCP app — keeps the deployment surface uniform but fights the form factor for scan-heavy views
  - Pure web app — right form factor for scanning but introduces a new deployment surface and fragments the UX
  - Hybrid — read-only web app for the dashboard, MCP apps for actions (NTP issue, delay logging, activation closure). Likely answer; needs ADR.
- **% complete per activation.** Three plausible drivers: (a) operator-reported per activation, (b) cost-to-committed ratio, (c) activation state (NTP'd=10%, started=50%, finished=100%). Likely (a) with (b) as an AI-suggested default. Affects pay-app generation in [scope 5](5-payments.md) too. Decide here; consume there.
- **Holiday calendar shape.** Hard-code US federal holidays, accept a per-job holiday list, or integrate a calendar library. Lean: hard-code US federal as default with per-job override field.
- **`parentPatchId` required for non-create edits.** Every dependency change is conceptually a change order; consider requiring `parentPatchId` for any `apply_patch` whose edits include non-`create` ops (cheap hygiene; surfaced in M3 dogfood). Resolve here since dependency edits will exercise this path heavily.
- **Cycle-prevention on `dependsOn`.** Validate at write time (rejects cycles up front) or accept and detect at read time (more flexible during multi-step edits but allows transient invalid state). Lean write-time rejection for simplicity.

## Engineering plan

Depends on [scope 0](0-foundation.md) being fully landed. Pairs with [scope 1](1-client-ledger.md) on activation-state lifecycle (variance interpretation lives in scope 1; underlying state machinery here).

1. **Schema.** `Activation.dependsOn`, `DelayEvent`, activation-closure event. Cycle-prevention.
2. **Math.** Critical path, slack, earliest-start derivation, holiday-aware working-days.
3. **Activation state lifecycle.** Projection from events to state; tools for state queries.
4. **ADR for schedule UI shape (MCP app vs web app vs hybrid).** This is the load-bearing UX decision; needs explicit reasoning before building.
5. **UI implementation.** Whatever the ADR lands on. If web-app-shaped: small Rust-served HTML with progressive enhancement, or React+TS+shadcn frontend per the language-boundary-at-HTTP principle from [ADR 0015](../../decisions/0015-pivot-mcp-server-to-rust-on-fly.md). If MCP-app-shaped: another `@modelcontextprotocol/ext-apps` view (or its Rust equivalent).

## Connects to

- [ADR 0007 — NTP derivation from current activation](../../decisions/0007-ntp-derivation-from-current-activation.md) — recompute logic extends with dependency awareness
- [scope 1 — Client-side ledger](1-client-ledger.md) — activation-state lifecycle pairs with realized/unrealized variance interpretation
- [scope 5 — Payments](5-payments.md) — % complete shape decided here, consumed there
- [`backlog.md` — Cross-cutting design](../backlog.md) — operator UX split (MCP apps vs web app)
- [SPEC.md §1](../../../SPEC.md) — Activation schema extension
