---
date: 2026-04-17
slug: scenario-runner
---

# Retro — scenario runner + Day-0 tools

## Context

Second session on 2026-04-17 after the first-live-deploy session closed M1. Branched `slice/scenario-runner` off main (`0aa94fc`) to land ADR 0004 Layer 2 and the TOOLS.md §6 Day 0 verbs it drives. Scope creep was the main decision point.

## Observations

- **"One tool" was the wrong frame.** Initial framing: "scaffold + `create_project` — one new tool, Day 0 runs end-to-end." Wrong — Day 0 also calls `create_scope` and `update_scope`, and needs a read for assertions (`list_scopes`). Surfacing the mismatch before writing code prevented a half-done slice. Pattern for next time: when a scoping option ties to "scenario X runs end-to-end," enumerate the verbs from the scenario *before* committing, not after.
- **Reset-before-migrate is a real bug.** First scenario run failed: `DELETE FROM costs: no such table`. Local D1 file existed (wrangler made it) but held only `_cf_KV` + `d1_migrations`. Fix: reset now runs `d1 migrations apply --local` first (idempotent), *then* truncates. Applies the same "don't assume any specific local state" lesson that the [first-live-deploy retro](2026-04-17-first-live-deploy.md) surfaced for `migrations_dir`.
- **`assertScopeTreeInvariants` has a sibling-set subtlety.** The validator collapses "parent not found" and "parent on another job" into `missing_parent` unless the tool layer hands it the cross-job parent. Caught by a failing test (expected `cross_job_parent`, got `missing_parent`) — the test was right, the handler's sibling query was wrong. Fix: fetch the parent globally in addition to same-job siblings. Worth remembering when any tool layer wraps a pure validator: the validator's preconditions are part of its contract.
- **Idempotence-then-truncate reset pattern feels right.** `--reset` always safe; `bun run scenario:reset` always safe. No "skip migrations" flag — if migrations are already applied, `wrangler d1 migrations apply` is a no-op. Same pattern that made `ensure_activity` the decisive smoke-test last session.
- **MCP SDK client "just worked" over HTTP + bearer.** `StreamableHTTPClientTransport` with `requestInit.headers.Authorization` connected first try; `Client.callTool` returns `structuredContent` directly usable as typed output. The previous session's note about Inspector CLI being broken was specific to Inspector — the SDK client itself is reliable.

## Decisions

- **`--reset` is idempotent and always safe.** Applies migrations, then truncates. No separate "skip" mode.
- **`list_scopes` is the Day-0 placeholder for scope assertions.** `get_scope_tree` (with committed/cost rollups) lands with Day 3 (first commitment), because only then does rollup math matter.
- **`update_scope` ships with a narrow surface** (`name`, `code`, `spec`). Reparenting (`parentId` change) lands with whatever first needs it — probably M4 dashboard editing, not M2.

## Actions taken

- New tools on `slice/scenario-runner`: `create_project`, `create_scope`, `update_scope`, `list_scopes` — 15 new tests, 45/45 mcp-server tests passing, 99% coverage.
- Layer-2 scaffold in [`packages/dev-tools/src/scenarios/`](../../packages/dev-tools/src/scenarios/): `client.ts` (MCP HTTP + bearer), `assert.ts`, `reset.ts` (migrate + truncate), `kitchen.ts` (Day 0), `scenarios.ts` (registry), `run.ts` (CLI).
- `bun run scenario kitchen [--reset]` + `bun run scenario:reset` scripts at package and root.
- Gate green (4/4); end-to-end smoke against `bun run dev` verified.
- [`now.md`](../product/now.md) flipped: scenario-runner + 4 tools → Recently done; M2 core tools (party/patch/ntp/cost) → Up next.

## Deferred

- **`get_scope_tree` read tool** with committed/cost rollups — lands with Day 3 (first commitment). Tracked in `now.md` #2.
- **M2 core tools** (`create_party`, `apply_patch`, `issue_ntp`, `record_cost`, `record_direct_cost`) — each lands alongside its day block in `kitchen.ts`. Tracked in `now.md` #1.
- **Reparenting support in `update_scope`** — not needed until a consumer edits the scope tree. Note in the module's header comment.
- **Carryover from prior retro:** `db:migrate:remote` deny-list entry, `seed:activities:remote`, `feat/m2-tools-and-seed` branch cleanup — still deferred.
