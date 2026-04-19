# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M2 — Commitment + NTP model](milestones.md) — fully on `main`

## Up next

1. **Clerk OAuth slice — replace Stytch stand-in.** Spike (see [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)) found Clerk hosts the consent page end-to-end for DCR clients (mandatory-on), eliminating the ~200–400 LOC of customer-hosted consent code Stytch Path B would have required. Spawn a worktree from `feat/dogfood-prep`; execute per [PROMPTS.md](../../PROMPTS.md). **Hard-gated by three pre-flight checks** — Clerk provisioning, `@clerk/backend` loading on Workers, and claude.ai DCR → Clerk hosted consent → token exchange round-trip. If any pre-flight fails, **fall back to Stytch Path B** (reconstruct prompt per [ADR 0012 §Rollback plan](../decisions/0012-clerk-for-prod-mcp-oauth.md) — the wiring skeleton from PR #28 is reusable either way). See [retro](../retros/2026-04-19-stytch-path-a-false-start.md) for why Path A failed and how we arrived at Clerk.
2. **Merge `feat/dogfood-prep → main`** after the Clerk slice lands and claude.ai connects end-to-end. M3 sequencing decided at the next session start.

## In flight

*(nothing)*

## Waiting on

- **Clerk instance provisioning** (Max). Live application with Dynamic Client Registration toggled on. Secrets at `op://gc-erp/clerk/{publishable-key,secret-key}`. Required for [PROMPTS.md](../../PROMPTS.md) pre-flight 1.

## Recently done

- **Stytch OAuth Path A shipped + rolled back** (2026-04-19): PR #28 merged to `feat/dogfood-prep` — handler bifurcation on `env.STYTCH_PROJECT_ID`, `/.well-known/oauth-authorization-server` + `/authorize` routes, `install:mcp:prod` cleanup, stytch SDK added via bunfig `minimumReleaseAgeExcludes`. Live Stytch project provisioned; secrets uploaded; Worker deployed. End-to-end smoke via claude.ai surfaced "Connected App not found" at the consent step — root cause: Consumer Connected Apps requires customer-hosted consent, not the blind 302 we shipped. `wrangler rollback` restored the pre-Stytch binary; bearer-Desktop dogfood unaffected. Auth.ts + secrets + turbo.json plumbing stays on the branch as reference for Path B. See [retro](../retros/2026-04-19-stytch-path-a-false-start.md).
- **OAuth plan landed on `feat/dogfood-prep`; install-mcp duplicate caught** (2026-04-19): PR #26 merged — [ADR 0010](../decisions/0010-stytch-oauth-for-prod-mcp.md) adopts Stytch Connected Apps as the prod OAuth 2.1 AS (claude.ai Custom Connectors reject static bearers and need OAuth + DCR); ARCHITECTURE.md + CLAUDE.md + dogfood.md rewritten to target state. PR #25 closed as duplicate — its worktree branched from `c435b0c` (pre-existing `packages/dev-tools/src/install-mcp/` directory) and rebuilt a parallel implementation; the ~30-line novel part (literal `localDevVars` override so the prod `MCP_BEARER_TOKEN` never leaks into `.dev.vars`) ported as [PR #27](https://github.com/mdml/gc-erp-mcp-server/pull/27). `feat/dogfood-prep` does not merge to `main` until Path B lands and claude.ai connects end-to-end. See [retro](../retros/2026-04-19-oauth-plan-and-pr25-dup.md).
- **M2 deployed to prod + end-to-end dogfood smoke** (2026-04-18): migrations `0001` + `0002` applied to remote D1, 22 activities seeded, Worker deployed at `gc.leiserson.me`, `bun run scenario kitchen --target prod` green against live infra (Day 0 → Day 60 walkthrough, full parity check). Claude Desktop connected via the mcp-remote bridge (`install:mcp:local` wired to localhost; prod entry via `install:mcp:prod`'s JSON block). `feat/dogfood-prep` carries the full surface; M2 is ready to merge to `main`.
- **Day 60 change-order scenario landed** on `slice/day-60-scenario` (2026-04-18): `kitchen.ts` adds a CO patch against `c_frame` — `addActivation` (+$900 pantry framing) + `setPrice` ($8,500 → $9,400 lump) in one `apply_patch`, exercising ADR 0008's "invariants run post-fold, not per-edit" atomicity. New `packages/database/src/projections/foldPatches` exposes the patch-chain fold as a pure function; `assertPatchesRollupParity` in the scenario runner folds every sent patch and checks the rollup matches `get_scope_tree` — the ADR 0008 §F3.2 parity check, operationalized. PR #24 against `feat/dogfood-prep`.
- **`record_cost` + `record_direct_cost` landed** (2026-04-18) on `slice/record-cost` (PR #23 → `feat/dogfood-prep`): TOOLS.md §3.2 (Day 14) + §3.3 (Day 18). `record_cost` is an append-only insert with cross-job + voided-commitment + activity-on-commitment + activation-belongs-to-commitment gates. `record_direct_cost` extracts a `composePatch` helper from `apply_patch` so the self-commitment + cost land in one D1 batch (ADR 0008) — atomicity test forces a batch-time cost-insert failure and asserts no orphaned commitment. 24 new tool tests + 19 existing apply_patch tests green.
