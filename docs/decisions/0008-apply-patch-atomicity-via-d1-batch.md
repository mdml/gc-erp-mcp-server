---
type: ADR
id: "0008"
title: "apply_patch atomicity via D1 batched statements"
status: active
date: 2026-04-17
spike: "apply-patch-shape"
---

## Context

[TOOLS §3.2](../../TOOLS.md) describes `apply_patch` as "atomic apply or error." [SPEC §1](../../SPEC.md) says "a Patch is applied atomically or not at all." Neither document specifies how.

The `patches` table landed in M1 alongside the normalized `commitments`, `activations`, and `commitment_scopes` tables (see [ADR 0003](0003-storage-split.md)). The current schema implies a **hybrid storage model**: the patches table is the append-only audit log; the normalized tables are the materialized projection that queries hit. No code today writes to both.

A single `apply_patch` call on a multi-edit patch (e.g. a change order that adds an activation and re-prices the commitment) must:

1. Load current commitment state by reading the normalized tables.
2. Fold the incoming edits over that state in memory.
3. Validate the commitment-level invariants against the post-fold state ([ADR 0005](0005-activations-carry-scopeid.md) inclusion invariant, `sum(pricePortion) == price.total`, activations-non-empty, etc.).
4. Insert the patch row into `patches`.
5. Insert / update / delete rows in `commitments`, `activations`, `commitment_scopes` to reflect the edits.
6. Return the finalized Patch to the caller.

Steps 4–5 must either all land or none land. A partial apply — patch row written but activations not updated, or activations updated without the patch row — corrupts the projection and breaks patches-as-audit.

## Decision

**`apply_patch` uses D1 batched statements to apply the patch row plus all projection mutations as a single atomic transaction. Invariant checks run in-memory against the post-fold state before the batch is submitted; if any SQL statement in the batch fails, D1 rolls the whole batch back and the tool returns an `invariant_violation` or `validation_error` per [TOOLS §1](../../TOOLS.md).**

Concretely, the handler flow is:

```
1. Open D1 read queries: current commitments + activations + commitment_scopes for
   every commitmentId referenced by the incoming edits.
2. Fold `edits` over the loaded state → post-fold Commitment objects.
3. Run invariant validators on the post-fold state (single pass, not per-edit).
4. Build a single db.batch([...]) containing:
     - INSERT into patches (...);
     - For each edit: INSERT/UPDATE/DELETE against commitments / activations /
       commitment_scopes to match the post-fold state.
5. Submit the batch. On error, surface as McpToolError.
6. On success, return the persisted Patch.
```

## Options considered

- **A. D1 batched statements (chosen).**
  - *Pros:* D1 guarantees ACID semantics across a batch; single network round-trip; matches Drizzle's `db.batch([...])` API cleanly; no application-level rollback code needed; projection and audit log land atomically.
  - *Cons:* batches don't support cross-statement data flow (a statement can't reference a row inserted by a prior statement in the same batch); the handler must compute the final row shapes in memory first. Acceptable — we're doing that anyway for invariant checks.
- **B. Single mega-SQL statement with CASE expressions per edit.**
  - *Rejected.* Not expressive enough for N-activation fan-out — a `create` edit inserts a commitment + M activations + M commitment_scopes junction rows, where M is bounded only by the edit's content. A single SQL statement can't grow to fit.
- **C. Optimistic apply with explicit rollback.**
  - *Rejected.* D1 doesn't expose transaction control (`BEGIN` / `ROLLBACK`) outside of batches. Application-level rollback means tracking "what did I write, what do I undo" by hand — the exact bug class batches eliminate by design. Any path that requires hand-rolled undo is worse than reaching for the atomicity primitive the database offers.
- **D. Write patch row first, return success, project asynchronously.**
  - *Rejected.* Breaks the "current state = fold(patches)" invariant from the operator's perspective — `get_scope_tree` called immediately after `apply_patch` returns might or might not reflect the patch, depending on projection-worker timing. Also introduces a worker that doesn't exist (we'd need a Queue + consumer). Deferred projection is an option for high-throughput systems; for a dozen-patches-per-year product, it's cost without benefit.

## Consequences

**Easier:**

- Handler structure is uniform across all six `CommitmentEdit` ops: read → fold → validate → batch. Each op's batch-contribution is a pure function.
- Invariants land in one place (the validator module), not sprinkled through write-SQL error handling. If the post-fold state violates an invariant, the batch never runs — no clean-up path needed.
- Error surface is clean: invariant errors surface before any SQL runs; SQL errors (FK violation, constraint violation) surface as a single batched failure.
- Future tools that also mutate commitments (none planned — `apply_patch` is the sole mutation API per [TOOLS §3.2](../../TOOLS.md)) inherit the pattern by copy.

**Harder:**

- Every new `CommitmentEdit` op must emit its batch SQL alongside its fold logic. Forgetting one half leaves the projection out of sync with the patches log. Caught by the "fold patches and compare to projection" parity check (spike §3.3.2 — implemented as a scenario-runner assertion).
- Batches have no inter-statement state, so any RETURNING-style pattern (INSERT and read back the generated id) has to be avoided — all ids are pre-computed in-memory. That's already the case here: every ID is client-generated (`pat_` + sha256, `actv_` + nanoid21, etc.) per `packages/database/CLAUDE.md`.
- The read-then-write pattern (read current state, compute diff, write) is not strictly read-committed under concurrent writers — two operators issuing patches against the same commitment could both load the same base state and produce a patch that last-write-wins'es the other. Single-operator assumption in SPEC makes this non-urgent; concurrency is a backlog item.

**Would trigger re-evaluation:**

- Sustained two-operator concurrent-write load on a single job. At that point we need optimistic-concurrency (patch insert with WHERE clauses asserting the parent state hasn't moved) or pessimistic locking. Not a batching rewrite — a layer added on top.
- D1 changing the batch API or its atomicity guarantees. Highly unlikely.
- A new write tool that fundamentally needs RETURNING-style chained SQL (e.g. a DB-generated id). Pressure to use a different atomicity primitive. None on the horizon — all our IDs are client-computed.

## Advice

Decided in session with Max on 2026-04-17, spike [`docs/spikes/apply-patch-shape.md`](../spikes/apply-patch-shape.md) F3.1. Referenced from [`packages/mcp-server/CLAUDE.md`](../../packages/mcp-server/CLAUDE.md) as the atomicity pattern for any future tool that fans out into multiple table writes.
