# Product docs — Agent instructions

Docs under `docs/product/` describe **what we're building and why**. They're the product-side counterparts to `docs/guides/` (how it's built) and `docs/decisions/` (why specific decisions were made).

## Files

| File / dir | Contains | Update cadence |
|---|---|---|
| [overview.md](overview.md) | Goal, success criteria, collaborators | Rarely — the north star |
| [scope/](scope/) | One file per prioritized scope (`0-foundation.md`, `1-client-ledger.md`, …, `5-payments.md`) plus a [README](scope/README.md) index | When a scope's shape shifts; add a new file when a new scope is identified |
| [now.md](now.md) | Ordered current-sprint tasks | Start/end of each working session |
| [backlog.md](backlog.md) | Open questions not yet slotted into a scope file | Continuously — items move into a scope file when slotted, into ADRs when resolved |

The legacy `scope.md` and `milestones.md` files were superseded by the `scope/` directory in the 2026-05-11 restructure. Milestones are no longer a separate concept — scope files are the unit of "what's next."

## When to update

- **Update `overview.md`** only when the fundamental pitch of the product changes. It should feel stable.
- **Update a `scope/N-*.md` file** when its shape shifts — what's in/out, which open questions remain, the engineering plan. Each scope file is sized to be read end-to-end; if a file gets very long, split it or move detail into ADRs.
- **Update `scope/README.md`** when scopes are added, dropped, or reordered, or when a global "out for v1" item changes.
- **Add a new scope file** (`scope/N-*.md`) when a new prioritized work area is identified. Pick the next number; don't reshuffle existing numbers (they're stable references).
- **Update `now.md`** at the start and end of each working session. It's the ordered next-N tasks, not a log.
- **Update `backlog.md`** in three cases: (1) when a new open question that doesn't belong to any current scope appears; (2) when an existing backlog item gets slotted into a scope file (delete from backlog; the scope file is the new home); (3) when an item resolves into an ADR or SPEC/TOOLS update (delete; the ADR / SPEC / TOOLS is the new home). Backlog is *only* for unslotted open questions.

## Not in scope here

- **Data model types and invariants** — [SPEC.md](../../SPEC.md).
- **Architecture** (repo layout, runtime, deploy, gates) — [docs/guides/ARCHITECTURE.md](../guides/ARCHITECTURE.md).
- **Individual decisions with options + rationale** — [docs/decisions/](../decisions/).
