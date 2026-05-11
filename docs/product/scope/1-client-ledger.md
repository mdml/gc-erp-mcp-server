# Scope 1 — Client-side ledger

**Why 1:** Most important for mental model. Today the data model only captures one direction of money flow: what we owe subs (downstream commitments and costs). The other direction — what clients owe us, and how money moves from client → us → sub — is invisible. Without it, distinctions like "passing through a sub cost with markup" vs "eating a sub cost" are unrepresentable, and pay-app generation (scope 5) has nothing on the client side to anchor on.

## What this scope is

Add the upstream / client side of the ledger. Today's data model has `Commitment` (an obligation we have to pay a sub) and `Cost` (an actual incurred cost against a commitment). Both are payable-only. This scope introduces the receivable side: what clients commit to pay us, what we bill them, what they pay, what's outstanding. The shape of that addition (single entity with `direction` enum vs separate entity types) is a meaningful schema fork that this scope decides.

This is also the scope where the dogfood-surfaced ledger-interpretation gaps land: self-commitment rollup semantics (currently variance-blind for direct costs), realized vs unrealized variance (currently conflated into one number), and the project ↔ job split for client contracts.

## In

- **Schema: client-side primitives.** Decision needed (see Open questions): either
  - **Path A** — `direction: payable | receivable` field on `Commitment` and `Cost`, with rollup math respecting direction (minimal change, forced symmetry between sub-side and client-side shapes)
  - **Path B** — Separate entity types: `ClientAgreement` (the contract), `ClientBilling` / `Receivable` (what we've billed), `ClientPayment` (what they've paid). Different shape from sub-side because pay schedules / milestones / retainage don't always map cleanly to activations.
- **Tools** for the client side (parallels to existing sub-side tools, or unified).
- **Self-commitment rollup semantics.** Currently `record_direct_cost` creates a "self-commitment" that contributes to `committed` the same as a sub commitment. Conceptually a self-commitment is "already paid, no future obligation" — not really committed. Direct costs are also variance-neutral by construction (the self-commitment is inflated by exactly the cost amount), so per-scope variance goes blind on them. Add a `selfFunded: boolean` flag (or equivalent via the chosen Path A/B shape) excluded from committed rollups.
- **Realized vs unrealized variance.** `committed − cost` today conflates "activation under-ran" (favorable variance) with "activation hasn't started" (just unrealized commitment). Per-activation state is needed to distinguish — activation state lifecycle is partly here, partly in [scope 3](3-schedule-deps.md) (where the schedule-event-log work lands). The interpretation rules for variance live here; the underlying state machinery lives in scope 3.
- **Project ↔ job for client contracts.** Client contracts are typically project-level; billing is per job. Add `Project.contractRef` (or equivalent) and decide whether project-level commitments (architect, GL insurance, permitting) are receivable-only, payable-only, or both.
- **Markup / passthrough representation.** A receivable line for $X often corresponds to a payable cost of $Y plus markup of $X−Y. The schema needs to express the relationship so reports can show gross vs net margin without manual reconciliation.

## Out

- **Pay-app generation (G702/G703 PDFs).** That's [scope 5 — Payments](5-payments.md). This scope adds the data model that scope 5's pay apps render against; the rendering itself is scope 5.
- **Lien waivers.** Scope 5.
- **Bidding / pre-signed contracts.** [Scope 2](2-bidding.md). Client contracts in this scope are assumed signed.
- **Fancy ledger logic.** QuickBooks stays the book of record; this scope models what we need internally for pay-app generation and operator visibility, not full GAAP accounting.
- **Project-level scopes / templates.** Scope of work today is per-job. Promoting Scope to project-level is in `backlog.md` (scope templates entry); not in this scope.

## Open questions

- **Client-side ledger shape: Path A vs Path B.** Needs an ADR before implementation. Path A (`direction` on Commitment) is the minimal change; Path B (separate `ClientAgreement` / `Sale` entity) is more honest about the shape difference (pay schedules ≠ activations) at the cost of more tools and more concepts. Surfaced in M3 dogfood.
- **Activation `pricePortion` semantics for unit-priced commitments.** Schema says `pricePortion: Money` — for unit-priced commitments, is it the *expected* portion at expected units? Pinning this matters for the receivable side too (markup math depends on it).
- **Fractional `estimatedUnits` × integer cents.** `Commitment.price.estimatedUnits` is `z.number().nonnegative()`, but the price-equals-activation-sum invariant compares integer cents. Fractional unit estimate × integer cents per unit can spuriously pass or fail. Forks: force-integer-cents invariant, tolerance-based comparison (±1¢), or tighten `estimatedUnits` to integer. Flagged in `packages/database/src/invariants/commitments.ts`.
- **Direct-materials escape hatch.** Requiring every Cost to reference a Commitment is clean but annoying for petty cash / direct buys. The current `record_direct_cost` self-commitment shape is the answer; the question is whether the rollup semantics fix above (`selfFunded`) is sufficient or whether direct-materials need their own entity shape.
- **Self-party / counterparty dedup.** No canonical `selfPartyId` on Job — every `record_direct_cost` in a fresh session can create duplicate "Max" parties. Candidates: a `Job.selfPartyId` field, or a dedup hint in `create_party`. Resolve as part of the self-commitment rollup work.
- **Project = property convention.** Agent during dogfood named the project "Nick Richards Kitchen Remodel" — collapsing client + work-type — instead of `project = property, job = work-type`. `create_project`'s tool description doesn't prescribe the convention; multi-job-per-property scenarios don't fit the chosen grain. Decide on enforcement (validation vs description hint vs leave open) when adding client-contract roll-down.
- **Project-level commitments.** Architect, GL insurance, permitting fees often span multiple jobs. v1 puts commitments on jobs; revisit when multi-job-per-project is real.

## Engineering plan

Depends on [scope 0](0-foundation.md) being fully landed (Rust foundation + tools at parity).

1. **ADR for ledger shape (Path A vs Path B).** Disposable POC is probably not needed — this is a modeling decision, not a vendor unknown. Discussion + ADR.
2. **Schema implementation.** Either `direction` enum + rollup math updates, or new entity types. With Rust sum types, the chosen shape is enforceable at the type level rather than at runtime.
3. **Self-commitment rollup fix + realized/unrealized variance.** Cleanly separable from the Path A/B decision; can ship in parallel.
4. **Client-side tools.** Whatever creating-and-recording client commitments / billings / payments looks like, plus query tools for reporting (what's outstanding, by job, by project, etc.).
5. **Project-contract roll-down.** `Project.contractRef` (or equivalent); connect to the `project = property` convention decision.

## Connects to

- [ADR 0005 — Activations carry scopeId](../../decisions/0005-activations-carry-scopeid.md) — rollup math foundations
- [ADR 0006 — Void commitment semantics](../../decisions/0006-void-commitment-semantics.md) — void semantics need extending to receivable side
- [ADR 0008 — Apply-patch atomicity via D1 batch](../../decisions/0008-apply-patch-atomicity-via-d1-batch.md) — atomicity contract carries over to Rust+Postgres equivalent
- [ADR 0009 — Void state projected on commitments](../../decisions/0009-void-state-projected-on-commitments.md)
- [SPEC.md §1](../../../SPEC.md) — data model extension lands here
- [scope 5 — Payments](5-payments.md) — pay-app generation operates over the receivable side this scope adds
- [scope 3 — Schedule dependencies](3-schedule-deps.md) — activation state work needed for realized/unrealized variance
