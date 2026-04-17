# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md)

## Up next

1. **`apply_patch` + `issue_ntp` + `get_scope_tree` — the Day 3 / Day 10 wave.** Spike resolved; four ADRs landed ([0005](../decisions/0005-activations-carry-scopeid.md), [0006](../decisions/0006-void-commitment-semantics.md), [0007](../decisions/0007-ntp-derivation-from-current-activation.md), [0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md)). `apply_patch` is the biggest — D1 batch atomicity per ADR 0008. Then `issue_ntp` (thin — no patch). Then `get_scope_tree` with subtree rollups per ADR 0005. Day 3 in `kitchen.ts` wires create + apply_patch + get_scope_tree and asserts `Demo.committed = $1,500`, `Framing.committed = $7,000`.
2. **`record_cost` + `record_direct_cost` — Day 14 / Day 18.** Blocked on (1). `record_cost` ties a cost to an activation + commitment + scope; `record_direct_cost` atomically creates a self-commitment via `apply_patch` + the cost.
3. **Day 60 change-order scenario** in `kitchen.ts`. Validates `addActivation` + `setPrice` in one patch; parity check (fold patches → commitments table) lands alongside as a scenario-runner assertion per [ADR 0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md) §F3.2.

## In flight

*(nothing yet)*

## Waiting on

*(nothing yet)*

## Recently done

- **`apply_patch` spike resolved** on `slice/resolve-apply-patch-spike`: four ADRs landed ([0005](../decisions/0005-activations-carry-scopeid.md) activations carry scopeId, [0006](../decisions/0006-void-commitment-semantics.md) void excludes from rollups, [0007](../decisions/0007-ntp-derivation-from-current-activation.md) NTP recomputes from current activation / drop `siteReady`, [0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md) D1-batch atomicity). SPEC §1 adds `Activation.scopeId` + drops `NTPEvent.siteReady`; migration `0001` is additive. Post-fold `assertActivationScopesInCommitment` invariant + F2.1 `jobId`-in-hash + F1.1 `setActivation` tightening + F2.5 equivalence test. New backlog entry: "Schedule event log — DelayEvent + activation closure" (absorbs the rain/site-block scenario + variance math). 146/146 database tests + 51/51 mcp-server tests green. M2 tool implementation unblocked.
- **`create_party` tool landed** on `slice/m2-create-party`: standalone slice for TOOLS.md §3.1 (`{ kind, name, email? } → Party`). Pure-handler + `createTestDb()` tests (6 tests), registered in `McpAgent.init()`. No Day 3 wiring — kitchen.ts update waits for `apply_patch`.
- **Scenario runner + Day-0 tools landed** on `slice/scenario-runner`: `bun run scenario kitchen [--reset]` drives TOOLS.md §6 Day 0 over MCP HTTP against `bun run dev`. Added `create_project`, `create_scope`, `update_scope`, `list_scopes` tools (pure-handler + in-memory-sqlite tests per [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) Layer 1) and the `packages/dev-tools/src/scenarios/` scaffold (client, reset, kitchen day blocks, assert helpers — Layer 2). `--reset` applies migrations + truncates local D1 idempotently. Smoke-tested end-to-end against `bun run dev`; 45/45 tool tests + 40/40 dev-tools tests passing, gate green.
- **M1 landed on live infra** (2026-04-17): D1 `gc-erp` + R2 `gc-erp-documents` provisioned via `infra:apply --yes`, `0000_careless_maverick.sql` migrated, Worker deployed at `gc.leiserson.me` (`a9d2268d`), `ensure_activity` smoke test idempotent against live D1. [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) codifies the two-layer acceptance-testing strategy. See [first-live-deploy retro](../retros/2026-04-17-first-live-deploy.md).
- **M2 tasks 1–2 landed** on `feat/m2-tools-and-seed`: `create_job`, `list_jobs`, `ensure_activity` tools (PR #7) establishing the `McpToolDef` pure-handler + in-memory-SQLite test convention; `seed:kitchen-fixture` for the SPEC §2 walkthrough (PR #6); SPEC §2 alignment + backlog party-FK entry (PR #8).
- **M1 tasks 1–3 landed** on `feat/m1-data-model`: D1 + R2 providers (`packages/infra`), `packages/database` (SPEC §1 Zod + Drizzle, 12 tables, 99% cov, 22-activity seed), inline-review convention in root CLAUDE.md. See [2026-04-17 parallel-worktrees retro](../retros/2026-04-17-parallel-worktrees.md).
