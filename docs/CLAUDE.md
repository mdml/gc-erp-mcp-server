# Docs — Agent instructions

How our docs are organized and when to update each. Each subdirectory has its own CLAUDE.md with the specifics — this file is the map.

## The docs landscape

| Directory / file | What lives here | Source of truth for | Update cadence |
|---|---|---|---|
| [`docs/product/`](product/) | Goal, scope, milestones, backlog | **What we're building and why** — the product pitch | When product shape shifts |
| [`docs/guides/`](guides/) | Orientation guides (ARCHITECTURE, etc.) | **Current state** — how things work right now | When architecture or tooling changes |
| [`docs/decisions/`](decisions/) | Architecture Decision Records (ADRs) | **Why decisions were made** — rationale, options, trade-offs | Per decision; ADRs are immutable once active |
| [`docs/spikes/`](#spikes) | Active time-boxed investigations | Ephemeral working docs — never permanent | Created and deleted as investigations run |
| [`docs/retros/`](retros/) | Retro logs — observations, decisions, actions per session | Append-only; daily-ish |

Three files that are *not* under `docs/` but are part of the doc landscape:

| File | What | Why it's at repo root |
|---|---|---|
| [`SPEC.md`](../SPEC.md) | Data model (Zod schemas), job walkthrough, open questions | First thing anyone reading the repo looks at; stays at the top |
| [`TOOLS.md`](../TOOLS.md) | MCP tool + app contract — verb surface companion to SPEC's type surface | Contract doc like SPEC; referenced by both product and engineering |
| [`README.md`](../README.md) | Onboarding + deploy | Standard repo convention |

## When to create or update each type

### Product docs (`docs/product/`)

See [product/CLAUDE.md](product/CLAUDE.md). In short: update when scope, milestones, or the backlog shift. Don't duplicate content between product docs and ADRs — the product doc says *what*; the ADR says *why*.

### Guides (`docs/guides/`)

See [guides/CLAUDE.md](guides/CLAUDE.md). Guides describe **current state**. When a PR lands that changes the architecture described in a guide, update the guide in the same PR. Guides are summaries — always link out to the authoritative source.

### ADRs (`docs/decisions/`)

See [decisions/CLAUDE.md](decisions/CLAUDE.md). Create an ADR when making an architectural decision: new dependency, storage strategy, auth model, cross-cutting pattern, or "why X over Y." Once active, never edit the substance of an ADR — supersede it with a new ADR instead. Use [0000-template.md](decisions/0000-template.md) as the starting point.

### Spikes (`docs/spikes/`)

*(Empty for now — convention established for future use.)*

A spike is a **time-boxed investigation** that produces a decision, not code. Create a spike when you need to answer a technical question before committing to a plan. Once the spike resolves, the decision becomes an ADR in `docs/decisions/` and the spike file is **deleted**. Spikes are ephemeral.

## Maintenance expectations

- **Authoring agent / session:** Before making a structural change, check whether an ADR should be written. Before updating a guide, check whether the change reflects current state or aspiration (only current state belongs in guides).
- **Reviewing agent / session:** Check whether the PR warrants an ADR that wasn't written. Check whether affected guides need updates. A PR that changes architecture without touching the architecture guide is an incomplete PR.
- **All sessions:** If you find a guide that contradicts the code, either the guide or the code is wrong. Treat the mismatch as a bug — fix one or the other in the same session.

## What's NOT here

- **Source code.** It's in `packages/`.
- **Data model types.** They're in [SPEC.md](../SPEC.md).
- **Per-package engineering instructions.** Each package has its own CLAUDE.md ([packages/CLAUDE.md](../packages/CLAUDE.md) has the umbrella).
