---
type: ADR
id: "0009"
title: "Void state projected as columns on the commitments row"
status: active
date: 2026-04-17
---

## Context

[ADR 0006](0006-void-commitment-semantics.md) decided that a voided commitment is excluded from `committed` rollups, while NTP events and already-recorded costs survive as-is. What it did not say was *where* that voidedness lives in storage. Two places are plausible:

1. **Derive it** at read time — a commitment is voided iff the patches log (in the `patches` table) contains an applied `void` edit for its id. Every rollup walks `json_each(patches.edits)`.
2. **Project it** — the `commitments` projection row carries a `voided_at` (and `voided_reason`) column, set by `apply_patch` when a `void` edit folds in. Rollups filter with a plain `WHERE voided_at IS NULL`.

[ADR 0008](0008-apply-patch-atomicity-via-d1-batch.md) frames the normalized tables (`commitments`, `activations`, `commitment_scopes`) as "the materialized projection that queries hit." The patches log is the audit record; the projection is the query surface. The tension surfaced when drafting `apply_patch`: if projection queries had to consult the audit log to answer "is this commitment alive?", the projection would be incomplete, and `get_scope_tree` (landing in the same M2 wave) would grow a JSON-scanning join for every read.

## Decision

**Voidedness is projected onto the `commitments` row as two additive nullable columns: `voided_at: TEXT` (ISO date-time) and `voided_reason: TEXT`. `apply_patch` writes them in the same batched transaction that persists the patch. Reads filter with `WHERE voided_at IS NULL` when excluding voided commitments from rollups.**

The Zod `Commitment` shape in [SPEC §1](../../SPEC.md) stays unchanged — `voided_at` / `voided_reason` are projection artifacts, not part of the SPEC domain type. On read, the `Commitment` object is reconstructed from the row without these columns; callers that need the voided state query the projection directly.

## Options considered

- **A. Project onto `commitments` (chosen).**
  - *Pros:* rollup filter is a column predicate, no JSON scan; the projection is self-sufficient per [ADR 0008](0008-apply-patch-atomicity-via-d1-batch.md); handler-layer gates like "can't NTP a dead contract" become a single column check; matches the pattern every other commitment attribute already follows.
  - *Cons:* one more migration; technically redundant with the patches log (same bit of state lives in two places, kept in sync by `apply_patch`).
- **B. Derive from the patches log at read time.**
  - *Rejected.* Every rollup read pays a `json_each(patches.edits)` cost, and the projection model becomes partially truthful — it describes shape but not lifecycle. Also forces `issue_ntp` / `record_cost` gates to do the same scan instead of a column read.
- **C. Soft-delete the row.**
  - *Not seriously considered.* Breaks the audit trail: NTP + cost rows retain FK references into the commitment; dropping the row cascades or dangles. Both break [ADR 0006](0006-void-commitment-semantics.md)'s "preserve NTP + cost history" stance.

## Consequences

**Easier:**

- `get_scope_tree` rollup SQL: `sum(activation.price_portion_cents) ... WHERE commitments.voided_at IS NULL`. One predicate, one index opportunity.
- `apply_patch`'s void op is a single `UPDATE commitments SET voided_at = ?, voided_reason = ? WHERE id = ?`. Fits cleanly into the batched-statements flow from [ADR 0008](0008-apply-patch-atomicity-via-d1-batch.md).
- `issue_ntp` and `record_cost` can gate with a boolean column read; no JSON scanning, no patches-log join.
- The Zod `Commitment` shape from SPEC stays the authoritative domain type — projection-only columns don't leak into the contract that other packages import.

**Harder:**

- Projection and audit log carry the same bit. `apply_patch` is the sole writer of both, so drift is local and caught by the projection-vs-log parity check (scenario-runner assertion per [ADR 0008](0008-apply-patch-atomicity-via-d1-batch.md) §F3.2, landing with the Day 60 change-order scenario).
- Un-voiding would require zeroing both columns. v1 has no un-void op ([ADR 0006](0006-void-commitment-semantics.md)), so this is a theoretical concern only.
- Future "is-this-commitment-voided" logic must read the column, not replay patches. Easy to get right when the column is the obvious home; easy to get wrong if a reader assumes the patches log is authoritative.

**Would trigger re-evaluation:**

- Adding a `commitment.status` state machine richer than `active | voided` (e.g. `suspended`, `closed_out`, `disputed`). The two-column shape was chosen for minimal v1 surface; a real state machine would replace these with a single `status` enum plus context columns.
- The projection-vs-log parity check catching drift that a schema migration could eliminate (e.g. some edge case where the void edit writes to the log but not the projection). Would suggest either the handler has a bug or the dual storage needs a reconsidered boundary.

## Advice

Decided in session with Max on 2026-04-17 during the first pre-coding pass of `apply_patch`. The fork was surfaced as a schema-shape question per the root [CLAUDE.md](../../CLAUDE.md) invariant ("schema forks are co-owned with Max"); Max picked A without further deliberation once the projection-self-sufficiency argument landed.
