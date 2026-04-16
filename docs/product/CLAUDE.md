# Product docs — Agent instructions

Docs under `docs/product/` describe **what we're building and why**. They're the product-side counterparts to `docs/guides/` (how it's built) and `docs/decisions/` (why specific decisions were made).

## Files

| File | Contains | Update cadence |
|---|---|---|
| [overview.md](overview.md) | Goal, success criteria, collaborators | Rarely — the north star |
| [scope.md](scope.md) | What's in / out of v1 | When scope shifts |
| [milestones.md](milestones.md) | Milestone plan (M1–M6) and status | As milestones complete |
| [backlog.md](backlog.md) | Unresolved questions + product-level TODOs | Continuously — items move to ADRs or SPEC.md as they resolve |

## When to update

- **Update `overview.md`** only when the fundamental pitch of the product changes. It should feel stable.
- **Update `scope.md`** when we consciously add or drop a v1 feature. New feature? Either it's in v1 (update scope) or it's not (and it stays out until we decide).
- **Update `milestones.md`** when a milestone lands, gets redefined, or is added.
- **Update `backlog.md`** whenever a question resolves. The resolution either becomes an ADR (`docs/decisions/`) or lands in SPEC.md — the backlog entry should then be crossed off and a one-line pointer left in its place.

## Not in scope here

- **Data model types and invariants** — [SPEC.md](../../SPEC.md).
- **Architecture** (repo layout, runtime, deploy, gates) — [docs/guides/ARCHITECTURE.md](../guides/ARCHITECTURE.md).
- **Individual decisions with options + rationale** — [docs/decisions/](../decisions/).
