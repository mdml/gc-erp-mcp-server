---
date: 2026-04-17
slug: tools-drift-audit
---

# Retro — TOOLS.md §2 drift caught by pre-action audit

## Context

Opened `worktree-m2-docs` with a brief to "add Document + DocumentId to packages/database/src/schema" and land it in SPEC.md §1. The audit step in [session-workflow](../guides/session-workflow.md) — "audit the top `now.md` item against the actual code before acting" — surfaced that everything except a TOOLS.md wording update had already shipped.

## Observations

- **The §2 schema landed in the M1 12-table sweep without TOOLS.md catching up.** [`packages/database/src/schema/documents.ts`](../../packages/database/src/schema/documents.ts), the `documents` table in [`0000_careless_maverick.sql`](../../packages/database/src/migrations/0000_careless_maverick.sql), [`SPEC.md:185-204`](../../SPEC.md), and `CostSource.documentId` on all three non-adjustment variants all merged in PR-era M1 work. TOOLS.md §2 still read "To land in SPEC.md §1 in a follow-up commit" four commits later. A doc that describes a future state ages into a lie the moment the state lands.
- **The CLAUDE.md warning is load-bearing.** Root CLAUDE.md says "doc-vs-code drift is the #1 friction in this repo" and prescribes an audit-before-acting step explicitly for this reason. Without it a ~60-minute re-implementation of already-landed code was the default path — the brief would have had me writing the schema file that already exists, tripping only at gate-green or at a file-conflict Edit.
- **Audit cost: roughly five tool calls.** `Read TOOLS.md §2`, `Read SPEC.md §1`, `ls packages/database/src/schema`, `Read documents.ts`, `Read 0000_careless_maverick.sql`. That's the entire delta between "re-build the feature" and "clean up the doc." Cheap enough that it should be reflex for every session on this repo, not a judgment call.
- **Forward-looking doc language is the failure mode.** §2's "To land in…" phrasing *sounded* like an imperative task in the brief, but it was descriptive of a plan. When a doc says "will X" or "in a follow-up commit," the PR that does X needs to edit the doc in the same commit — otherwise the descriptive claim becomes a false one. Same rule [ARCHITECTURE.md is already held to](../guides/ARCHITECTURE.md).

## Decisions

- **TOOLS.md §2 collapses to a pointer.** Schema + invariants live in SPEC.md §1; §2 keeps only the fork trail (same pattern as §8 resolved forks).
- **Top-of-file status line reflects landing incrementally** rather than binary "proposed." §2 landed; §3 in progress. Future sessions flip sub-sections individually.
- **No write-side tools in this PR.** `store_document` / `request_upload` / `finalize_upload` / `get_document` still need R2 binding + content-hash verification and land as their own slice. §3.4 already scopes them correctly.

## Actions taken

- [`TOOLS.md`](../../TOOLS.md) edits: status line (landing incrementally); §2 collapsed to pointer + fork trail; §8 Document entry flagged as landed; §9 flipped to "see SPEC.md §1 (Document + CostSource.documentId)".
- Retro logged here as a drift-catch example for the next session to read.
- Docs-only PR to main on `worktree-m2-docs`; no code changes.

## Deferred

- **Write-side document tools** (`store_document`, `request_upload`, `finalize_upload`, `get_document`) — R2 wiring + sha256 verification are their own slice. Tracked implicitly by `now.md` #1 carrying M2 core tools; not broken out yet because the kitchen walkthrough's Day 14 is the first caller and lands with `record_cost`.
- **Process guardrail for forward-looking doc language.** Worth a follow-up: a lightweight convention ("if a doc section says 'will land' or 'in a follow-up commit,' the landing PR must edit the section"). Belongs either in root CLAUDE.md under doc hygiene or as a commit-message checklist. Not urgent enough to block this PR; noted in [`backlog.md`](../product/backlog.md) on next sweep.
