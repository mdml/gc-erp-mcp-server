---
type: ADR
id: "0005"
title: "Activations carry scopeId"
status: active
date: 2026-04-17
spike: "apply-patch-shape"
---

## Context

[TOOLS.md §6 Day 3](../../TOOLS.md) asserts `Kitchen.committed = $8,500`, `Demo.committed = $1,500` (lumber drop + punch), `Framing.committed = $7,000` against a single commitment whose `scopeIds: [s_demo, s_framing]` and whose three activations price out at $500 / $7,000 / $1,000. These assertions are algebraically unsatisfiable against the current SPEC §1 shape: `Activation` carries `activityId` (what work) but no `scopeId` (where it attributes), and `Commitment.scopeIds` is a flat set with no per-scope price breakdown.

The `get_scope_tree` read tool, scheduled to land alongside the first commitment-bearing scenario day, needs a `scope.committed` rollup that matches the assertion. There is no way to derive per-scope committed totals from the current shape without guessing (even distribution, weighted by something ad-hoc, etc.) — and the spike rejected even-distribution immediately because it breaks the Day 3 assertion.

The spike enumerated three ways out: add `scopeId` to `Activation` (F5.1); distribute commitment price evenly across `scopeIds` (F5.2, rejected); or require single-scope commitments and re-write the Day 3 setup (F5.3, contradicts SPEC's `scopeIds.min(1)` support for multi-scope commitments).

## Decision

**`Activation` carries a `scopeId: ScopeId` field. The rollup rule is `scope.committed = sum(activation.pricePortion WHERE activation.scopeId ∈ subtree(scope))`. Invariant: `activation.scopeId ∈ commitment.scopeIds`.**

This makes the scope attribution explicit at the price-portion level — the smallest unit where attribution is meaningful — and makes `commitment.scopeIds` the declared coverage surface while activations provide the actual per-scope breakdown.

## Options considered

- **A. Add `scopeId` to `Activation` (chosen).**
  - *Pros:* matches Day 3 math exactly; aligns with how operators think (activation is "what work," scope is "where it goes"); preserves `Commitment.scopeIds` as the declared coverage (useful for narrative + validation — "this commitment should cover Demo and Framing"); derivation `scope.committed = sum(activations WHERE scopeId ∈ subtree)` is a clean SQL or TS fold.
  - *Cons:* more nested state to keep consistent; every `create` and `addActivation` edit must assert `scopeId ∈ commitment.scopeIds`; introduces a new FK (`activations.scope_id → scopes.id`) plus an invariant that scopes belong to the commitment's job.
- **B. Distribute commitment price evenly across `commitment.scopeIds`.**
  - *Rejected.* Breaks Day 3 immediately: Rogelio's $8,500 split across Demo + Framing = $4,250 each, not $1,500 / $7,000. Would force every multi-scope commitment to have identical per-scope cost, which real contracts almost never do.
- **C. Single-scope commitments only; collapse Day 3's Demo + Framing into a single parent scope for Rogelio.**
  - *Rejected.* Contradicts SPEC §1's `scopeIds: z.array(ScopeId).min(1)` explicit multi-scope support, and contradicts the TOOLS §6 Day 3 narrative. Would also push attribution decisions ("is this activation a Demo or a Framing cost?") into the scope tree itself, which is where they don't belong — scopes are "what deliverable," not "how we chunked pricing for one commitment."
- **D. Leave `Activation` untouched; compute rollups by pro-rating each activation's `pricePortion` across the commitment's `scopeIds` using a weighted scheme (e.g., proportional to scope area or activity-scope affinity).**
  - *Rejected.* Any weighting scheme is extra state the operator would have to maintain. The operator already knows which activation attributes to which scope at the point of writing the contract — capturing that is strictly simpler than inventing a weighting rule.

## Consequences

**Easier:**

- `get_scope_tree` rollup is a straight `sum(pricePortion)` grouped by scope subtree; no allocation math, no ambiguity.
- Day 3–60 TOOLS §6 scenario assertions are satisfiable as written.
- Change orders that add an activation ("add pantry framing for $900") naturally carry their scope — no separate reconciliation step.
- Commitment narrative stays intact: `scopeIds` is the declared coverage ("this contract is for Demo + Framing"); activations are the granular attribution.

**Harder:**

- Every `create` and `addActivation` patch edit must validate `activation.scopeId ∈ commitment.scopeIds` post-fold. Added to the invariant helpers in `packages/database/src/invariants/commitments.ts`.
- Every `setActivation` edit that changes `scopeId` must preserve the inclusion invariant. The edit shape already omits `id` from the patchable fields; `scopeId` stays patchable (in case the operator catches a typo), but the post-fold invariant check is the guard.
- Schema migration: `activations.scope_id` column + FK to `scopes(id)`. Not a zero-downtime migration, but we have no live commitment data yet (M1 shipped schema + seed only), so cost is near zero.
- `Commitment.scopeIds` and the `commitment_scopes` junction table become slightly redundant with the set of `activation.scopeId`s. Kept for v1 because (a) declared coverage is useful narratively and for validating patch edits, and (b) dropping the junction is a bigger migration best deferred. Long-term, if the redundancy bites, the junction is what goes.

**Would trigger re-evaluation:**

- A real-world commitment pattern where one activation legitimately attributes to multiple scopes (e.g., "mobilization fee covers both demo and framing"). Today the answer would be to split it into two activations with proportional `pricePortion`. If that gets painful, revisit as a many-to-many `activation_scopes` junction with per-scope price portions — which is a bigger change and reads like the real "F5.1 v2."
- A move to a different rollup scheme (e.g., pay-app-driven attribution) that makes the commitment-level `scopeIds` the source of truth and activations attribute transiently. No current pressure in that direction.

## Advice

Decided in session with Max on 2026-04-17 after reviewing [`docs/spikes/apply-patch-shape.md`](../spikes/apply-patch-shape.md). Max's call: F5.1 is the load-bearing fork; the other three load-bearing calls (F1.4, F4.1, F3.1 — ADRs 0006–0008) are downstream of this one, because the rollup math and the invariant set both depend on knowing `scopeId` lives on the activation.
