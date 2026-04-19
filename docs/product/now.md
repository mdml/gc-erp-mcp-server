# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md) — fully on `main`

## Up next

1. **OAuth migration to Stytch ([ADR 0010](../decisions/0010-stytch-oauth-for-prod-mcp.md)) — blocks claude.ai dogfood.** Scenario-runner prod smoke is green over bearer, but claude.ai web + iOS + Android Custom Connectors reject static bearer headers — they require OAuth 2.1 + DCR. Coding slice: add the `stytch` SDK + secrets (`STYTCH_PROJECT_ID`, `STYTCH_SECRET`) via `secrets.config.ts` and `turbo.json globalPassThroughEnv`; wrap `/mcp*` with Stytch JWT validation in prod (bearer stays for local, gated on `env.STYTCH_PROJECT_ID` absence); expose `/.well-known/oauth-authorization-server` + `/authorize` routes per Stytch's Cloudflare template; update `handler.test.ts` and the `install:mcp:prod` block to drop `Authorization: Bearer …`. See ADR 0010 §"Implementation notes" for the open verification items (streamable HTTP vs SSE, plain-fetch vs Hono).
2. **Merge `feat/dogfood-prep → main`** after the Stytch slice lands and claude.ai connects end-to-end. M3 sequencing decided at the next session start.

## In flight

*(nothing)*

## Waiting on

*(nothing yet)*

## Recently done

- **OAuth plan landed on `feat/dogfood-prep`; install-mcp duplicate caught** (2026-04-19): PR #26 merged — [ADR 0010](../decisions/0010-stytch-oauth-for-prod-mcp.md) adopts Stytch Connected Apps as the prod OAuth 2.1 AS (claude.ai Custom Connectors reject static bearers and need OAuth + DCR); ARCHITECTURE.md + CLAUDE.md + dogfood.md rewritten to target state. PR #25 closed as duplicate — its worktree branched from `c435b0c` (pre-existing `packages/dev-tools/src/install-mcp/` directory) and rebuilt a parallel implementation; the ~30-line novel part (literal `localDevVars` override so the prod `MCP_BEARER_TOKEN` never leaks into `.dev.vars`) ported as [PR #27](https://github.com/mdml/gc-erp-mcp-server/pull/27). `feat/dogfood-prep` does not merge to `main` until the OAuth coding slice (item 1 above) lands and claude.ai connects end-to-end. See [retro](../retros/2026-04-19-oauth-plan-and-pr25-dup.md).
- **M2 deployed to prod + end-to-end dogfood smoke** (2026-04-18): migrations `0001` + `0002` applied to remote D1, 22 activities seeded, Worker deployed at `gc.leiserson.me`, `bun run scenario kitchen --target prod` green against live infra (Day 0 → Day 60 walkthrough, full parity check). Claude Desktop connected via the mcp-remote bridge (`install:mcp:local` wired to localhost; prod entry via `install:mcp:prod`'s JSON block). `feat/dogfood-prep` carries the full surface; M2 is ready to merge to `main`.
- **Day 60 change-order scenario landed** on `slice/day-60-scenario` (2026-04-18): `kitchen.ts` adds a CO patch against `c_frame` — `addActivation` (+$900 pantry framing) + `setPrice` ($8,500 → $9,400 lump) in one `apply_patch`, exercising ADR 0008's "invariants run post-fold, not per-edit" atomicity. New `packages/database/src/projections/foldPatches` exposes the patch-chain fold as a pure function; `assertPatchesRollupParity` in the scenario runner folds every sent patch and checks the rollup matches `get_scope_tree` — the ADR 0008 §F3.2 parity check, operationalized. PR #24 against `feat/dogfood-prep`.
- **`record_cost` + `record_direct_cost` landed** (2026-04-18) on `slice/record-cost` (PR #23 → `feat/dogfood-prep`): TOOLS.md §3.2 (Day 14) + §3.3 (Day 18). `record_cost` is an append-only insert with cross-job + voided-commitment + activity-on-commitment + activation-belongs-to-commitment gates. `record_direct_cost` extracts a `composePatch` helper from `apply_patch` so the self-commitment + cost land in one D1 batch (ADR 0008) — atomicity test forces a batch-time cost-insert failure and asserts no orphaned commitment. 24 new tool tests + 19 existing apply_patch tests green.
- **Dogfood script surface landed** (2026-04-18): `db:migrate:{local,prod}`, `db:seed:activities:{local,prod}`, `db:seed:kitchen:local`, `db:query:{local,prod}`, `db:reset:local`, `install:mcp:{local,prod}`, `scenario --target`. Shared plan+confirm helper; `:prod` seeding goes through a tempfile + `wrangler d1 execute --file`. Implementation in `packages/dev-tools/src/{db,install-mcp,plan-confirm,scenarios/args}.ts`; roots in `package.json`. Opens PR against `feat/dogfood-prep`.
- **M2 fully on `main`** (2026-04-18): `apply_patch` (ADR 0008 D1-batch atomicity, 6 edit ops, void projection); `issue_ntp` (Day 10, derived schedule per ADR 0007); `get_scope_tree` + kitchen Day 3/10 wiring (subtree rollups, `Demo.committed = $1,500`, `startBy 2026-05-04`); `create_party`. PRs #11, #13, #15, #17, #18.
