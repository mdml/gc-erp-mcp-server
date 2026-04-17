---
date: 2026-04-17
slug: doc-landscape
---

# Retro — doc landscape tightening

## Context

Max asked for a retro on the repo. A prior-session agent (the one that landed ADR 0003, TOOLS.md, and the Document schema) left detailed reflections about doc drift, thin milestones, and missing per-session planning. Worked through them with a timeboxed fix.

## Observations

- **Four docs all tracked "unresolved items":** `backlog.md`, `SPEC.md §4`, `TOOLS.md §8`, and implicit session-to-session synthesis. Caused the `storage` question to be crossed off in backlog but still listed as open in SPEC §4.
- **`milestones.md` M1 had drifted.** One-liner didn't mention D1/R2/`packages/database`/Document/file tools — all of which were pulled into M1 by ADR 0003 and TOOLS.md.
- **No "this week" doc.** Each session re-synthesized the next-N tasks from primary sources.
- **Coverage thresholds disagreed across docs.** Root `CLAUDE.md` = 90/70; `README.md` = 80/60. Actual `vitest.config.ts` across all packages = 90/70. README was stale.
- **`packages/mcp-server/CLAUDE.md` had residual ambiguity.** Described the DO as SQLite-backed without noting (post-ADR 0003) that SQLite is session-runtime-only, not domain state.
- **`packages/CLAUDE.md` had no explicit naming convention.** Implicit in existing names; not called out.
- **`docs/intent-agents.md` was long-lived scratch** outside `docs/spikes/` — taxonomy exception without reason.
- **Session workflow was undocumented.** Docs describe *where things live* (shape) but not *how a session flows* (tempo). Biggest friction per Max: understanding current state of the app vs. what the docs plan, and figuring out what to work on next.

## Decisions

- **One place for unresolved items:** `backlog.md`. SPEC is the contract, not the tracker.
- **Milestones stay one-liners** (north stars); add `docs/product/now.md` for the ordered "this week" view.
- **Stand up `docs/retros/`** with a lightweight playbook. Daily-ish cadence.
- **90/70 coverage thresholds** are canonical; README updated.

## Actions taken

- Deleted `docs/intent-agents.md`; cleaned references in `docs/CLAUDE.md` and `docs/guides/ARCHITECTURE.md`.
- Fixed `README.md` coverage thresholds (80/60 → 90/70).
- Excised `SPEC.md §4`; migrated still-open items into `backlog.md`; added a one-line pointer from SPEC to backlog.
- Restructured `backlog.md` into topical sections; reframed intro as the single open-items tracker.
- Added DO-session-only invariant to `packages/mcp-server/CLAUDE.md` (with [ADR 0003](../decisions/0003-storage-split.md) pointer).
- Added package-naming rule to `packages/CLAUDE.md`.
- Created `docs/product/now.md` with current M1 work.
- Created `docs/retros/CLAUDE.md` (playbook) + this retro.
- Created `docs/guides/session-workflow.md` (branching model + start/during/end rhythm). Added short "Session rhythm" section to root `CLAUDE.md` with the orient-before-acting rule centered.

## Deferred

- **TOOLS.md status.** Still marked `proposed` — decide whether shapes are settled (→ `active`) or flag the remaining forks. Added to `now.md`'s "waiting on Max" slot implicitly; surface explicitly next session.
- **Dogfood loop guide.** `docs/guides/dogfood-loop.md` covering Claude Desktop ↔ `wrangler dev` wiring + a short prompt library for each milestone. Separate session.
- **`PROJECT.md` vestige.** 14-line redirect stub; either delete once old refs have rotted or leave. 2-minute call.
- **Retro agent as a proper subagent.** Current invocation: *"read docs/retros/CLAUDE.md and run a retro."* Promote to a slash command or `.claude/agents/` entry if the plain-language invocation starts feeling lossy.
