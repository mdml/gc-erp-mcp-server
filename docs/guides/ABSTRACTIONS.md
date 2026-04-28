# Abstractions — the data-model big ideas

> What the model *means*, framed as load-bearing claims rather than a schema dump. For the Zod contract, see [SPEC.md](../../SPEC.md). For the verb surface, see [TOOLS.md](../../TOOLS.md). For the *why* behind specific decisions, see [docs/decisions/](../decisions/). For the runtime, see [ARCHITECTURE.md](ARCHITECTURE.md).

The schema reads as a list of types. This guide reads as a list of *ideas* — the ones you'd lose if the schema rotted away. Five of them.

---

## 1. Four orthogonal axes, joined by Activation

A GC's reality doesn't collapse into one hierarchy. The model has four:

| Axis | What it is | Schema home |
|---|---|---|
| `Scope` | The *noun* — the thing being built, Apple-tech-spec style ("Cabinets, IKEA BODBYN, soft-close") | Per-job tree; [`packages/database/src/schema/scopes.ts`](../../packages/database/src/schema/scopes.ts) |
| `Activity` | A *verb library* shared server-wide ("Lumber Drop", "Frame", "Punch", "Cabinet Install") | Cross-job; [`packages/database/src/schema/activities.ts`](../../packages/database/src/schema/activities.ts) + 22-item starter library in [TOOLS.md §7](../../TOOLS.md) |
| `Commitment` | The *paper you signed* with one counterparty (Rogelio's $8,500 framing contract, signed once) | Per-job; [`packages/database/src/schema/commitments.ts`](../../packages/database/src/schema/commitments.ts) |
| `Activation` | The M×N join — one activity × one scope, at one `pricePortion`, with its own `leadTime` + `buildTime` | Inside its parent commitment; carries `scopeId` per [ADR 0005](../decisions/0005-activations-carry-scopeid.md) |

The relationships don't collapse cleanly because they're genuinely many-to-many in real GC work:

- **One contract spans many scopes.** Rogelio's frame contract touches demo, framing, *and* punch.
- **One scope sees many contracts.** The Cabinets scope sees the supplier, the installer, the electrician's undercabinet lights, the painter's crown touch-up.
- **Same sub does different activities on the same scope, weeks apart.** Frame, then punch, on the same contract.

`Activation` is what lets money and schedule land on both axes at once. Without it, you'd either fragment a single contract into mini-contracts you didn't actually sign, or you'd lose the per-scope rollup when one contract touches multiple scopes.

## 2. Activation is the atomic unit, not the commitment

The load-bearing consequence of the four-axis split:

- **NTP fires per activation**, not per commitment ([ADR 0007](../decisions/0007-ntp-derivation-from-current-activation.md)). Rogelio framing in May and coming back for punch in July are two activations with their own schedule windows on the same contract.
- **`pricePortion` is per activation** — the schedule of values on the contract.
- **Cost rollups attribute through the activation's `scopeId`** ([ADR 0005](../decisions/0005-activations-carry-scopeid.md)). `scope.committed = sum(activation.pricePortion WHERE activation.scopeId ∈ subtree(scope))`.

If schedule and price lived on the commitment instead of the activation, a sub who shows up for multiple passes couldn't be scheduled or accounted for correctly. The atomic-unit choice is what makes the schedule and the cost rollups real.

## 3. Append-only money + content-addressed history = audit trail for free

The model never overwrites. Three mechanisms cooperate:

- **`Cost`s are never edited.** Corrections are adjustment costs — a new `Cost` with `source.kind: "adjustment"`. The history of what was thought-true at any past moment is recoverable.
- **`Commitment`s mutate only via `Patch`es.** Content-addressed groups of edits (`create`, `setPrice`, `addActivation`, `setActivation`, `removeActivation`, `void`). Current commitment state = `fold(patches)`. A change order ("add a pantry") is one atomic patch — `addActivation` on the framing commitment + `setPrice` on the cabinets commitment — applied via D1 batch with invariants checked end-to-end ([ADR 0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md)).
- **Identity-changing edits are `void` + re-create**, not in-place ([ADR 0006](../decisions/0006-void-commitment-semantics.md)). Re-scoping or swapping counterparties preserves the original audit trail rather than rewriting it.
- **`Document`s extend the same idea.** Content-addressed by `sha256`; same bytes → same row, R2 object key derived. Legal artifacts (lien waivers, pay apps, signed contracts) can't drift.

The payoff: every dispute can be reconstructed from history without back-of-envelope guessing. "Audit trail" isn't a feature you turn on — it's what falls out of the storage shape.

## 4. The binding invariant

```
sum(activation.pricePortion) == commitment.price.total
```

(For unit-priced commitments: `== price.perUnit * price.estimatedUnits`. The fractional-units × integer-cents tension is flagged in [backlog.md](../product/backlog.md) and [`packages/database/src/invariants/commitments.ts`](../../packages/database/src/invariants/commitments.ts).)

Every dollar on every contract is allocated to exactly one scope through its activation. *That's* what makes scope rollups defensible numbers and not approximations — "how's Cabinets tracking?" has an answer with the right four-party contribution baked in, even when four different parties contribute to that scope.

## 5. The simple case stays simple

One sub × one scope × one activity = a lump commitment with a single activation. The four-axis model doesn't tax the trivial case; it becomes load-bearing the moment a contract touches three scopes or a scope is touched by four contracts. The schema rewards complexity-when-it-shows-up rather than demanding it up front.

This matters because dogfood-first means most early jobs *are* trivial cases. If the model only paid off at M5 multi-sub-per-scope dashboards, the four-axis cost would feel speculative. Instead it costs zero in the simple case (`activations: [singleActivation]`) and becomes the right shape the moment reality goes M×N.

---

## What this guide is NOT

- **Not the schema.** [SPEC.md](../../SPEC.md) is the Zod contract.
- **Not the verb surface.** [TOOLS.md](../../TOOLS.md) is the tool catalogue + scenario walkthrough.
- **Not the runtime.** [ARCHITECTURE.md](ARCHITECTURE.md) is the machine.
- **Not a decision log.** [`docs/decisions/`](../decisions/) is why-this-not-that. This guide cites them.

If a load-bearing idea isn't here yet, it should be — open a PR.
