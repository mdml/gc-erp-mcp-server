---
type: ADR
id: "0006"
title: "Void commitment semantics: exclude from rollups, preserve NTPs + costs"
status: active
date: 2026-04-17
spike: "apply-patch-shape"
---

## Context

[SPEC §1](../../SPEC.md) defines `Patch` with a `void` op on `CommitmentEdit`, but doesn't specify what "voided" means for the three downstream state surfaces:

1. **Rollups** — does a voided commitment still contribute to `scope.committed`?
2. **NTP events** — what happens to NTPs issued against activations of a now-voided commitment?
3. **Costs** — what about costs already recorded against it?

Without an explicit answer, the `get_scope_tree` rollup rule and the `issue_ntp` / `record_cost` tool guards would get implemented by whoever writes them first — and the three answers need to line up or the dashboard shows contradictory numbers.

The spike surfaced this as F1.4 and recommended a specific combination: **void excludes from rollups, preserves audit-level event data**.

## Decision

**A voided commitment is excluded from `committed` rollups. Its NTP events and any costs already charged to it are preserved in the event log as-is — voiding is a state transition on the commitment, not a retroactive rewrite of the event history.**

Concretely:

- `scope.committed` excludes commitments where the latest patch for that commitment applied a `void` edit.
- `NTPEvent` rows survive. `get_schedule` and dashboard schedule views continue to show them; if the scope tree or commitment state is rendered alongside, they simply dangle (pointing at an activation on a voided commitment — the UI decides whether to mark it visually).
- `Cost` rows survive. `scope.cost` rollups still include costs that happened before the void. `scope.variance = scope.committed - scope.cost` therefore swings negative (overspend) for any scope whose voided commitments had costs — the honest answer, and the signal the operator needs to see.

## Options considered

- **A. Exclude from `committed`; preserve NTPs + costs (chosen).**
  - *Pros:* matches the semantic of "this contract is dead" — no phantom committed dollars; audit trail stays intact because NTPs and costs describe things that actually happened; variance math surfaces voided-with-costs as overspend automatically, which is the right alarm.
  - *Cons:* dashboard must render NTPs that point into voided commitments without breaking (dangling references are possible until activation-closure events land in M3+); variance formulas need to be careful that a commitment moving from active → voided can flip a scope from under- to over-budget without explanation unless the tooltip tells the operator "this is because of voided commitment c_frame."
- **B. Keep void in `committed` with a `voided: true` flag; let the UI hide it.**
  - *Rejected.* Defeats the purpose of the verb. If a voided commitment still counts toward committed, then "void" is mostly a tagging operation and the operator has to explicitly filter it out wherever they look — which will get missed and cause wrong totals.
- **C. Cascade-delete NTPs and costs when voiding.**
  - *Rejected.* Destroys audit. A void is "we terminated this contract" — it's not "this never happened." NTPs actually issued and costs actually incurred belong in history regardless of the contract's subsequent death.
- **D. Reject `void` when NTPs or costs exist — force the operator to do something else (an adjustment cost, a zeroed-price re-negotiation) to wind down the commitment.**
  - *Rejected for v1.* Too restrictive for dogfood. Real contracts do get terminated mid-stream; the operator needs a way to say "we're done with this sub, stop counting their $X as committed." An advisory warning at void-time ("this commitment has 2 NTPs and $480 in costs — voiding will flip Demo.variance from $1020 to overspend") is better UX than a hard refusal.

## Consequences

**Easier:**

- `get_scope_tree` rollup query has a clean predicate: "commitment is not in the voided set."
- Void is a cheap operation — single-edit patch, no cascade, no relational clean-up.
- Variance math stays simple: always `committed - cost`; no special-casing voided.

**Harder:**

- Dashboard UX around voided-with-costs needs to communicate *why* variance went positive — a naive display will look like a bug. Surface as a scope-level annotation ("$480 in costs attributed to voided commitment c_frame") once dashboards land in M4.
- The NTP + cost tools (`issue_ntp`, `record_cost`) need to decide whether to reject writes that target a voided commitment's activations. Current leaning: reject — you can't NTP a dead contract, and you can't book a new cost against one. But costs that *already exist* stay, and the operator can still issue an adjustment cost (`CostSource.adjustment`) to correct a bad charge retroactively. Lock this in when `issue_ntp` and `record_cost` land.

**Would trigger re-evaluation:**

- Real operator feedback that voiding a commitment mid-stream is too heavyweight because they just want to temporarily pause tracking ("we might come back to this"). That would be the signal to add a lighter `suspend` op or a "status: paused" state, but it's speculative until someone hits it.
- A need to surface voided commitments in reports (e.g., "all contracts terminated this year") — that's read-tool work, doesn't touch this decision.

## Advice

Decided in session with Max on 2026-04-17, spike [`docs/spikes/apply-patch-shape.md`](../spikes/apply-patch-shape.md) F1.4. The only alternative Max considered seriously was (B) soft-void-with-flag; rejected quickly once the "then what's the verb actually doing" test failed.
