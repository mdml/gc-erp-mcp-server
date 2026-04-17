# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md)

## Up next

1. **M2 core tools — commitment + NTP arc.** The verbs the kitchen walkthrough still needs: `create_party`, `apply_patch` (commitment edits + change orders), `issue_ntp`, `record_cost`, `record_direct_cost`. Each lands with its Day N block in `kitchen.ts`. See [TOOLS.md §3](../../TOOLS.md).
2. **`get_scope_tree` read tool.** `list_scopes` is the Day-0 placeholder; the dashboard-flavored tree-with-rollups lands alongside the first commitment-bearing day so Day 3+ can assert `Kitchen.committed`, `Demo.variance`, etc.

## In flight

*(nothing yet)*

## Waiting on

- Max to pick the next open schema question worth resolving (see [backlog.md](backlog.md)).

## Recently done

- **Scenario runner + Day-0 tools landed** on `slice/scenario-runner`: `bun run scenario kitchen [--reset]` drives TOOLS.md §6 Day 0 over MCP HTTP against `bun run dev`. Added `create_project`, `create_scope`, `update_scope`, `list_scopes` tools (pure-handler + in-memory-sqlite tests per [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) Layer 1) and the `packages/dev-tools/src/scenarios/` scaffold (client, reset, kitchen day blocks, assert helpers — Layer 2). `--reset` applies migrations + truncates local D1 idempotently. Smoke-tested end-to-end against `bun run dev`; 45/45 tool tests + 40/40 dev-tools tests passing, gate green.
- **M1 landed on live infra** (2026-04-17): D1 `gc-erp` + R2 `gc-erp-documents` provisioned via `infra:apply --yes`, `0000_careless_maverick.sql` migrated, Worker deployed at `gc.leiserson.me` (`a9d2268d`), `ensure_activity` smoke test idempotent against live D1. [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) codifies the two-layer acceptance-testing strategy. See [first-live-deploy retro](../retros/2026-04-17-first-live-deploy.md).
- **M2 tasks 1–2 landed** on `feat/m2-tools-and-seed`: `create_job`, `list_jobs`, `ensure_activity` tools (PR #7) establishing the `McpToolDef` pure-handler + in-memory-SQLite test convention; `seed:kitchen-fixture` for the SPEC §2 walkthrough (PR #6); SPEC §2 alignment + backlog party-FK entry (PR #8).
- **M1 tasks 1–3 landed** on `feat/m1-data-model`: D1 + R2 providers (`packages/infra`), `packages/database` (SPEC §1 Zod + Drizzle, 12 tables, 99% cov, 22-activity seed), inline-review convention in root CLAUDE.md. See [2026-04-17 parallel-worktrees retro](../retros/2026-04-17-parallel-worktrees.md).
