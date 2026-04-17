---
date: 2026-04-17
slug: first-live-deploy
---

# Retro — first live deploy, M1 complete

## Context

Landed `feat/m2-tools-and-seed` onto main (PR #9), then ran the full `infra:apply` → `db:migrate:remote` → `turbo run deploy` → smoke-test chain from the main checkout. First tool invocation against live D1 (`ensure_activity` × 2) returned the expected idempotent row (`act_BMNiaW8LM-KGKVKPeOAnn` stable across calls). M1 is functionally complete.

## Observations

- **Token-permission drift caught by a just-landed doc.** `Zone → Workers Routes:Edit` was missing on `CLOUDFLARE_API_TOKEN`; `wrangler deploy` failed on the routes-PUT step. The permission-groups table in [ARCHITECTURE.md §4](../guides/ARCHITECTURE.md) (commit `2aab5d0`, landed earlier today) turned a multi-minute diagnosis into 30 seconds. Doc-as-troubleshooting works when the table is canonical and the failure message names the endpoint.
- **`migrations_dir` was an unnamed seam.** The D1 provider patched the binding with `{ binding, database_name, database_id }` but not `migrations_dir` — caught ahead of `infra:apply` by reading the provider code. Fixed in commit `2b9083a` plus a new `db:migrate:remote` script. A less deliberate session would have deployed against an empty D1 and hit "no such table" on first tool call.
- **Provision-last was the right sequencing.** ADR 0002 was written in anticipation of M1–M2 needing D1/R2, but the actual `infra:apply --yes` was deferred until schemas + tools + migrations-wiring were ready. Deferring cost nothing (dry-run-default, the code sat quietly on main); running earlier would have meant re-provisioning against the PR #2 schema refactor — a dev-loop tax for no gain.
- **MCP Inspector CLI was broken for us.** Both `--transport http` and `--transport streamable-http` returned "Only stdio transport can be used with local commands." Bypassed with raw curl. Smoke-test guidance should skip the Inspector first and go straight to curl.
- **Zod → JSON Schema round-trip is end-to-end clean.** `tools/list` over the wire showed `"pattern": "^\\d{4}-\\d{2}-\\d{2}$"` on `startedOn` — `IsoDay` flowing through `McpToolDef` → `McpServer.registerTool` → the wire. Any MCP client validates args against the schema automatically; no client-side type duplication needed.
- **Idempotence was the decisive smoke-test assertion.** Two calls with the same slug returned the same `id`. First-call-succeeds could be a broken server that always inserts; same-id-on-second is what proves the SELECT-then-INSERT path. Worth remembering when designing future smoke tests — the re-run is more informative than the first run.

## Decisions

- **Inspector CLI is not a smoke-test dependency.** curl is the preferred smoke surface — fewer moving parts, pasteable into retros for debugging, works across Inspector versions.
- **[ADR 0004 active.](../decisions/0004-acceptance-testing-strategy.md)** Two-layer acceptance testing: tool-contract tests already shipped in PR #7, scenario-runner design landed, LLM-driven E2E deferred to M6 or until a wedge demands it.

## Actions taken

- Merged PR #9 (rebase, 5 commits) — `feat/m2-tools-and-seed` → main.
- `bun run infra:apply --yes` — D1 `gc-erp` + R2 `gc-erp-documents` provisioned; bindings committed in `9a84ce0`.
- `bun run db:migrate:remote` — `0000_careless_maverick.sql` applied to live D1 (17 commands, 3.39ms).
- `turbo run deploy` — Worker live at `gc.leiserson.me`, version `a9d2268d-eee4-463d-91cc-aa242f6a13a0`, bindings confirmed (`MCP_OBJECT`, `DB`, `DOCUMENTS`).
- Smoke test: initialize → `tools/list` (4 tools, schemas intact) → 2× `ensure_activity` (id `act_BMNiaW8LM-KGKVKPeOAnn` stable across calls).
- Flipped [milestones.md](../product/milestones.md) M1 parenthetical to "Complete 2026-04-17" and cleared landed tasks from [now.md](../product/now.md) Up next.

## Deferred

- **Add `bun run db:migrate:remote` to agent-config deny list.** Production D1 mutation currently matches the broad `bun run <anything>` auto-allow shape. Belongs in `packages/agent-config/src/policy/deny.ts` as a separate PR. Flagged during the d1.ts change session.
- **Seed activities against live D1.** The 22-activity starter library has only been run against local SQLite. Needs a `seed:activities:remote` script paralleling `db:migrate:remote` before real dogfood use — lands in M2 or M3 as the scenario runner firms up.
- **Clean up `feat/m2-tools-and-seed` branch.** Remote + local still alive at pre-merge commits. Safe to delete when the next M2 slice branches off main.
