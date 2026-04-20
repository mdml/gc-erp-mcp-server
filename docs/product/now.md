# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M3 — First MCP app (cost-entry form)](milestones.md) — on `slice/cost-entry-form`

## Up next

1. **`apps/mcp-server/` move.** Per [ADR 0013](../decisions/0013-apps-layout-convention.md) Consequences → Harder: move `packages/mcp-server/` → `apps/mcp-server/`, update root `workspaces` glob, `.worktreeinclude`, CLAUDE.md § Repo shape, ARCHITECTURE.md, any `turbo.json` paths. Verify the parallel `agent-config` work has landed first (no scope overlap, but rebase cleaner if it's in).
2. **Adopt `@modelcontextprotocol/ext-apps` in `apps/mcp-server/`.** Add v1.6.0; register a minimal app tool (no real UI yet); put the `getUiCapability()` probe in `McpAgent.init()`. Respect vendor-guide constraints §6.1/§6.3/§6.4/§6.7/§6.8.
3. **Scaffold `apps/cost-entry-form/` as a Vite + singlefile project.** Minimal HTML + `App` + `PostMessageTransport` bootstrap per guide §3. Submission calls existing `record_cost`. Close guide §7 unverified rows in first Desktop dogfood; open backlog entries for anything that slips.

## In flight

- **`slice/cost-entry-form` — ADRs 0013 + 0014 drafted as commit 1** (branched from `main` at `4242661`). Implementation work queued above.
- **`packages/agent-config` PR-diff improvements** (separate agent). No file overlap with this slice.

## Waiting on

*(nothing)*

## Recently done

- **MCP Apps vendor guide landed** ([PR #35](https://github.com/mdml/gc-erp-mcp-server/pull/35), 2026-04-20): POC-driven verification of `@modelcontextprotocol/ext-apps@1.6.0`; closed 5 spike-claim deltas (most load-bearing: wrangler split-assets landmine §6.4, `getUiCapability` call-site correction §6.8). First exercise of the new vendor-guide convention; seeds ADR 0014.
- **Post-M2 hygiene retro landed** ([PR #34](https://github.com/mdml/gc-erp-mcp-server/pull/34), 2026-04-19): 7 `draft.md` observations folded into durable decisions — new-vendor → POC → vendor-guide forcing function, `--help`-before-secrets invariant, repo-wide rebase-merge-only (server-side verified), Desktop-prod flagged unverified, `apps/` move deferred to M3 slice scaffolding.
- **Spike 0001 — MCP Apps SDK** ([PR #33](https://github.com/mdml/gc-erp-mcp-server/pull/33), 2026-04-19): evaluated `@modelcontextprotocol/ext-apps` against rendering / bundle / wire-format / security / packaging criteria. +4.3 KB gz bundle cost, zero `node:*` imports. Seeded ADR 0014's Options considered.
