# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md)

## Up next

1. **Scenario runner (`bun run scenario kitchen`).** Drives [TOOLS.md §6](../../TOOLS.md) over MCP HTTP against `bun run dev`. Doubles as demo script + seed generator. Scaffold covers Day 0 first; Days 3/10/14/18/60 land as tools below do. Design per [ADR 0004](../decisions/0004-acceptance-testing-strategy.md).
2. **M2 core tools.** The verbs the kitchen walkthrough needs beyond what's shipped: `create_scope`, `update_scope`, `create_party`, `apply_patch` (commitment edits + change orders), `issue_ntp`, `record_cost`, `record_direct_cost`. See [TOOLS.md §3](../../TOOLS.md).

## In flight

*(nothing yet)*

## Waiting on

- Max to pick the next open schema question worth resolving (see [backlog.md](backlog.md)).

## Recently done

- **M1 landed on live infra** (2026-04-17): D1 `gc-erp` + R2 `gc-erp-documents` provisioned via `infra:apply --yes`, `0000_careless_maverick.sql` migrated, Worker deployed at `gc.leiserson.me` (`a9d2268d`), `ensure_activity` smoke test idempotent against live D1. [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) codifies the two-layer acceptance-testing strategy. See [first-live-deploy retro](../retros/2026-04-17-first-live-deploy.md).
- **M2 tasks 1–2 landed** on `feat/m2-tools-and-seed`: `create_job`, `list_jobs`, `ensure_activity` tools (PR #7) establishing the `McpToolDef` pure-handler + in-memory-SQLite test convention; `seed:kitchen-fixture` for the SPEC §2 walkthrough (PR #6); SPEC §2 alignment + backlog party-FK entry (PR #8).
- **M1 tasks 1–3 landed** on `feat/m1-data-model`: D1 + R2 providers (`packages/infra`), `packages/database` (SPEC §1 Zod + Drizzle, 12 tables, 99% cov, 22-activity seed), inline-review convention in root CLAUDE.md. See [2026-04-17 parallel-worktrees retro](../retros/2026-04-17-parallel-worktrees.md).
