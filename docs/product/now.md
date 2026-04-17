# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md)

## Up next

1. **First live D1 + R2 provision.** `bun run infra:apply --yes` from the main checkout — names `gc-erp` / `gc-erp-documents` confirmed. Then `turbo run deploy` to apply bindings. *(M1 tail — independent of M2 work; unblocks live dogfood.)*
2. **ADR 0004 — acceptance testing strategy.** Codify the layer-1 pattern already shipped (`McpToolDef` pure handler + `_test-db.ts` in-memory SQLite) and decide the layer-2 scenario-runner design. [TOOLS.md §6](../../TOOLS.md) is the first scenario.
3. **Scenario runner (`bun run scenario kitchen`).** Drives [TOOLS.md §6](../../TOOLS.md) over MCP HTTP against `bun run dev`. Doubles as demo script + seed generator. Scaffold covers Day 0 first; Days 3/10/14/18/60 land as tools below do.
4. **M2 core tools.** The verbs the kitchen walkthrough needs beyond what's shipped: `create_scope`, `update_scope`, `create_party`, `apply_patch` (commitment edits + change orders), `issue_ntp`, `record_cost`, `record_direct_cost`. See [TOOLS.md §3](../../TOOLS.md).

## In flight

*(nothing yet)*

## Waiting on

- Max to pick the next open schema question worth resolving (see [backlog.md](backlog.md)).

## Recently done

- **M2 tasks 1–2 landed** on `feat/m2-tools-and-seed`: `create_job`, `list_jobs`, `ensure_activity` tools (PR #7) establishing the `McpToolDef` pure-handler + in-memory-SQLite test convention; `seed:kitchen-fixture` for the SPEC §2 walkthrough (PR #6); SPEC §2 alignment + backlog party-FK entry (PR #8).
- **M1 tasks 1–3 landed** on `feat/m1-data-model`: D1 + R2 providers (`packages/infra`), `packages/database` (SPEC §1 Zod + Drizzle, 12 tables, 99% cov, 22-activity seed), inline-review convention in root CLAUDE.md. See [2026-04-17 parallel-worktrees retro](../retros/2026-04-17-parallel-worktrees.md).
- Doc-landscape tightening: backlog as single open-items source, `now.md` + `retros/` conventions, [session-workflow guide](../guides/session-workflow.md). See [2026-04-17 retro](../retros/2026-04-17-doc-landscape.md).
