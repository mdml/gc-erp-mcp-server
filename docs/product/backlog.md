# Backlog

Unresolved questions. When a question resolves, it either becomes an ADR (`docs/decisions/`) or lands in [SPEC.md](../../SPEC.md) / [TOOLS.md](../../TOOLS.md); cross the backlog entry off and leave a one-line pointer.

> This file — not SPEC or TOOLS — is the single place where open questions live. Keep leanings brief and unauthoritative; if a leaning is firming up into a decision, write an ADR.

## Data model / schema

- [ ] **Scope taxonomy.** CSI codes vs. custom lightweight list vs. free-form. Commercial CSI feels heavy for residential custom. Leaning: free-form `name` + optional `code`, with a curated seed list. *(Currently: free-form; see [SPEC.md §1](../../SPEC.md).)*
- [ ] **Direct-materials escape hatch.** Requiring every Cost to reference a Commitment is clean but annoying for petty cash / direct buys. Option: a per-job "self-commitment" that absorbs direct materials, auto-created.
- [ ] **% complete on pay apps.** Three plausible drivers: (a) operator-reported % per activation, (b) cost-to-committed ratio, (c) activation state (NTP'd=10%, started=50%, finished=100%). Likely (a) with (b) as an AI-suggested default. Needs a `ProgressReport` event? Or a field on Activation?
- [ ] **Billed vs. paid.** Nothing in the schema currently tracks billing/payment state. Add `PayApp` as a first-class event (numbered, approved, paid)? Add `Payment` as another append-only event referencing a Cost or PayApp line?
- [ ] **Activation `pricePortion` for unit-priced commitments.** Schema says `pricePortion: Money` — for unit-priced, is it the *expected* portion? Needs nailing down.
- [ ] **Fractional `estimatedUnits` × integer cents.** `Commitment.price.estimatedUnits` is `z.number().nonnegative()`, but the price-equals-activation-sum invariant compares integer cents. A fractional unit estimate (42.5 sqft × 7500¢ = 318750¢, fine; 42.5 × 7501¢ = 318792.5¢, rounds) can spuriously pass or fail the check depending on how the cents are reconstructed. Options: force-integer-cents invariant, tolerance-based comparison (±1¢), or tighten `estimatedUnits` to integer. Flagged in `packages/database/src/invariants/commitments.ts`.
- [ ] **Retainage.** Field on Commitment, field on each pay app line, or per-job default?
- [ ] **Closing an activation.** When is it "done" — operator flips a flag, or last cost lands? Matters for variance.
- [x] ~~Storage backend (Postgres vs. SQLite+Litestream vs. DO SQLite).~~ *Resolved: D1 + R2 + DO-session-only. See [ADR 0003](../decisions/0003-storage-split.md).*
- [x] ~~Where do commitments live — git-shaped storage vs. mutable DB?~~ *Resolved: append-only `patches` table + materialized commitment projection. [ADR 0003](../decisions/0003-storage-split.md).*
- [x] ~~Activity concept for scopes done in multiple pieces.~~ *Resolved in SPEC.md + starter library in [TOOLS.md §7](../../TOOLS.md).*
- [x] ~~Commitment schema + NTP event.~~ *Drafted in [SPEC.md §1](../../SPEC.md).*
- [x] ~~`Document` schema.~~ *Resolved in [SPEC.md §1](../../SPEC.md); narrative in [TOOLS.md §2](../../TOOLS.md).*

## Patches / event sourcing

- [ ] **Concurrency.** Single-operator is fine for dogfood. Two-operator on one job eventually means two patches at once. Git-style branching? Linear chain with optimistic concurrency? Likely post-v1.
- [ ] **Patch granularity.** Should a patch span multiple jobs (project-level CO affecting two jobs)? Current schema says no.
- [ ] **Authoring UX.** Does the operator batch edits into a patch consciously, or does the server auto-group edits within a session?

## Runtime / MCP

- [ ] **Where does the server run long-term?** Local process (`npx`), hosted, or both? Affects auth and multi-device story.
- [ ] **Which MCP app ships first.** Leaning: cost-entry form at M3, job dashboard at M4, pay app generator at M5. See [milestones.md](milestones.md).
- [ ] **How Claude picks an app.** Return type? Explicit hints? Re-read the MCP Apps extension spec before M3.

## Project ↔ job

- [ ] **Project-level commitments.** Architect, GL insurance, permitting fees often span multiple jobs. v1 puts commitments on jobs; revisit when >1 job per project exists.
- [ ] **Contract roll-down.** Client contract is typically project-level but billing is per job. Probably a `contractRef` field on Project, pay apps still job-level.

## File ingestion

- [ ] **R2 retention policy.** Document rows are permanent; the R2 objects may not need to be. Post-POC.

## Product wedge

- [ ] Pick the POC wedge — leaning pay app automation (painful, recurring, money-on-the-line).
- [ ] Study Adaptive (AI-native construction accounting) — template or competitor.

## Meta

- [x] ~~How Claude Code will be fed the spec — one SPEC.md or SKILL.md per module?~~ *Resolved: SPEC.md (types) + [TOOLS.md](../../TOOLS.md) (verbs) at repo root; per-tool docs as JSDoc on handler modules.*
