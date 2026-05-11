# Scope 0 — Foundation

**Why 0:** Foundation gates everything. Without it, scopes 1–5 either don't ship at all or ship on the wrong stack. The strategic decisions are captured in [ADR 0017](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md) (stack pivot to Rust + axum + Fly.io) and [ADR 0016](../../decisions/0016-portability-layer-justfile-multi-harness.md) (vendor-portable agent harness); this file is the operating plan that turns those ADRs into shipped slices.

## What this scope is

Re-baseline the technical foundation. Two parallel-but-independent threads:

1. **Vendor-portable agent harness** — Justfile as the canonical command surface; AGENTS.md alongside CLAUDE.md; Zed configured for multi-agent (Claude Code + Codex); sunset `packages/agent-config`.
2. **Rust MCP server on Fly.io** — re-encode the existing data model and re-implement the M3-dogfooded MCP tools in Rust (`axum` + `rmcp` + `sqlx` + Postgres), then cut over from the TypeScript Worker on Cloudflare to the Rust binary on Fly.

Foundation lands first because the new Rust stack is where every product scope (1–5) gets built. Building scope 1 work in TypeScript on Cloudflare would mean throwing it away at cutover.

## In

**Portability slice** (per [ADR 0016](../../decisions/0016-portability-layer-justfile-multi-harness.md), amended 2026-05-11):

- Justfile at root with `just check`, `just test`, `just bootstrap`, `just deploy` recipes wrapping current `bun` / `turbo` invocations
- `AGENTS.md` as canonical project-context file (vendor-neutral filename); `CLAUDE.md` is a thin `@AGENTS.md` import + any Claude-Code-specific notes. Same pattern per package.
- `.zed/tasks.json` with `create_worktree` hook → `scripts/bootstrap.sh` (idempotent; copies env files, installs deps). Same script wired into the `claude --worktree` flow via `.worktreeinclude` + a SessionStart hook. Zed-as-agent-host framing captured in `docs/guides/zed.md`.
- `packages/agent-config` deleted; `bun install` hook removed; per-harness permission surfaces hand-maintained: narrow `.claude/settings.json` for Claude Code; `.codex/config.toml` + Starlark `.codex/rules/*.star` for Codex (per Codex's `prefix_rule` grammar). Codex specifics + the trust-gate footgun captured in `docs/guides/codex.md`.

**Secrets handling** (continues [ADR 0015 — dotenvx](../../decisions/0015-dotenvx-secrets-management.md)):

- dotenvx stays as the local-dev secret vehicle, wired into Justfile recipes from Slice A's first commit — `just check` invokes CodeScene which already requires `CS_ACCESS_TOKEN` from `.env.local`, so `bunx dotenvx run -f .env.local -- <cmd>` is the inner wrap for every recipe that touches a secret. Same shape regardless of whether the inner command is `cargo`, `fly`, `bun`, or anything else. Per-developer encrypted-at-rest model unchanged.
- Prod secrets move from `wrangler secret put` to `fly secrets set` at P4 cutover. Adds: `FLY_API_TOKEN` (deploy), `DATABASE_URL` (Postgres). Retires: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Rust MCP server slice** (per [ADR 0017](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md), phases P1–P4):

- P1 — Disposable POC: smallest possible `axum` + `rmcp` + Clerk JWT validation + `sqlx`/Postgres on Fly.io. Outputs: `docs/guides/rust-mcp.md` + focused stack ADRs (e.g. `clerk-rs` vs hand-rolled JWT, MCP transport shape).
- P2 — Hand-coded data model: SPEC §1 entities re-encoded in Rust by Max. Domain enums (sum types), `sqlx` queries with build-time checking, error types, newtypes for IDs. Agents walk through idiom; no agent-generated code in this phase.
- P3 — MCP tools to dogfood parity: re-implement only the M3-dogfooded tools — `apply_patch`, `create_party` / `create_job` / `create_project` / `create_scope`, `update_scope`, `ensure_activity`, `get_scope_tree`, `list_jobs` / `list_scopes`, `issue_ntp`, `record_cost`, `record_direct_cost`, `cost_entry_form`, `ping`. No new tools.
- P4 — Cutover: deploy Rust binary to Fly; point Claude Desktop at the new endpoint; retire the TS Worker; delete the `apps/mcp-server.ts-archive/` directory; close out CF account usage for this project.

## Out

- **New domain entities or tools** beyond the M3-dogfooded set. Those land in scopes 1–5. Foundation is parity, not expansion.
- **Workers-rs / WASM dialect.** Explicit no-go per [ADR 0017](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md). One Rust dialect at a time; native axum is the target.
- **UI work.** Future UIs ride as React + TypeScript + shadcn talking to the Rust backend over HTTP. Foundation doesn't add a frontend.
- **Multi-region Postgres.** Single-region on Fly is the trade for two-operator scale; revisit if scope changes.
- **Hibernatable session state.** Cloudflare's `McpAgent` Durable-Object hibernation goes away — replaced with simpler in-memory or Postgres-backed session state.
- **Adopting Codex's policy-as-code.** Each harness manages its own permission surface; we don't double-maintain a cross-harness policy abstraction.

## Open questions

These resolve during the foundation work, mostly via the P1 POC + an ADR each:

- **`clerk-rs` vs hand-rolled Clerk JWT validation.** `clerk-rs` exists but is less mature than `@clerk/backend`. Hand-rolling against Clerk's JWKS via `jsonwebtoken` + a JWKS cache is ~50 LOC. Decided at P1 POC; ADR if non-obvious.
- **MCP transport shape in `rmcp`.** Streamable-HTTP support, session-state model, compatibility with Claude Desktop's expectations. Validated at P1 POC.
- **Session state: in-memory vs Postgres-backed.** Cloudflare's per-session DO model goes away. Probably in-memory keyed by session ID for two-operator scale; revisit if multi-region or operator count grows.
- **`packages/dev-tools` future.** Currently TypeScript-only; some of its surface (sync-secrets, gate runner) needs a Rust-or-shell equivalent for the new stack. Decide at P3 — likely shell scripts called from Justfile recipes.
- **`packages/database` future.** Drizzle/Zod-based; gets fully replaced by the Rust crate. Archive at P4 alongside the TS Worker.
- **`packages/infra` future.** Cloudflare-specific. Replace with `fly.toml` + a small Rust or shell CLI for Fly provisioning at P1 / P4.
- **ID-validator tightness in `apply_patch`.** Currently runtime-validated as "non-empty string"; the agent invented IDs like `cmt_rogelios-framing-001` during M3 dogfood and they landed in prod D1. Three forks: (a) tighten validator to `^prefix_[A-Za-z0-9_-]{21}$` with data-migration cost; (b) server-generate on `op: "create"` before hashing (changes the contract); (c) describe-and-pray. Resolve as part of P3 (re-implementing `apply_patch` in Rust is the moment to choose; sum types + newtypes make (a) trivially enforceable). ADR.
- **Tool-description polish at parity.** Four concrete adds, fold into P3: `issue_ntp` — note Mon–Fri working days; `ensure_activity` — hint to `list_activities` first; `create_project` — name the `project = property` convention; `apply_patch` — note the expected ID shape.
- **R2 → Tigris (or other S3-compatible) for blobs.** R2 isn't yet used by shipped code — `Document` rows reference an `r2Key` but no tool stores blobs. Defer the swap until the first scope that actually writes blobs (likely scope 5 for pay-app PDFs).

## Engineering plan

**Foundation ships in two slices that can run in either order or partially in parallel:**

### Slice A — Portability layer (per [ADR 0016](../../decisions/0016-portability-layer-justfile-multi-harness.md), amended 2026-05-11)

Ships first. Lower risk, smaller scope, validates multi-harness flow before there's a Rust port to drive through it. Four sub-steps, ordered lowest-risk first; one PR (`feat/portability-layer`).

1. **Justfile at root** with the verb surface (`just check`, `just test`, `just bootstrap`, `just deploy`, plus a `default` recipe running `just --list`). Recipes wrap current `bun` / `turbo` invocations; dotenvx is the inner wrap on any recipe that touches a secret. Rust recipes added at P1.
2. **`AGENTS.md` as canonical project-context file.** Rename each `CLAUDE.md` → `AGENTS.md` (root + per-package). Replace each `CLAUDE.md` with a thin `@AGENTS.md` import plus any peeled-off Claude-Code-specific content (e.g. the root's "Agent auto-allow — command shapes" section, which documents `.claude/settings.json` shape).
3. **Zed task glue + worktree bootstrap script.** `.zed/tasks.json` with `create_worktree` hook → `scripts/bootstrap.sh` (idempotent: copies `.env.local`/`.env.keys` if `BOOTSTRAP_ENV_SOURCE` / `ZED_MAIN_GIT_WORKTREE` set, runs `bun install`, fast-paths out if `node_modules` exists). Same script wired into `claude --worktree` via existing `.worktreeinclude` + a SessionStart hook. `docs/guides/zed.md` written per the vendor-guide convention (Agent Panel, external agents via ACP, `create_worktree` task hook, "we don't use Zed Agent thread type" boundary).
4. **Sunset `packages/agent-config` + add Codex permission surface.** Delete the package; remove the `bun install` hook from `package.json`'s `prepare` script; narrow `.claude/settings.json` to a small hand-maintained file lifting current allow/deny verbatim. Add `.codex/config.toml` (with `approval_policy`, `sandbox_mode`, `[mcp_servers.*]`) and `.codex/rules/*.star` (Starlark `prefix_rule` translations of the Claude allowlist). `docs/guides/codex.md` written per the vendor-guide convention, including the trust-gate footgun (repo-local `.codex/config.toml` does not load until the user accepts the trust prompt on first run).

PR shape: one slice (`feat/portability-layer`).

### Slice B — Rust MCP server (per [ADR 0017](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md), phases P1–P4)

Starts after slice A lands (or in parallel via worktree). Phases run sequentially.

- **Phase P1 — POC + vendor guide.** Disposable spike. Outputs a deployed-to-Fly hello-world MCP, `docs/guides/rust-mcp.md`, and one or more focused ADRs (Clerk JWT path, MCP transport shape). Estimated 1–3 days.
- **Phase P2 — Hand-coded data model.** Max writes the Rust data model and valid-states machinery by hand. Scope ≈ SPEC §1 (existing entities, no expansion). Agents walk through idiom. Estimated 2–5 days.
- **Phase P3 — MCP tools to parity.** Re-implement the M3-dogfooded tools in Rust against the hand-coded model. One tool per slice/PR. Estimated 1–2 weeks.
- **Phase P4 — Cutover.** Deploy to Fly; point Claude Desktop at the new endpoint; retire the TS Worker; delete the archive; close out CF usage. Estimated 1 day.

The TS Worker is archived in-tree (`apps/mcp-server.ts-archive/`) at the start of P1 and deleted at the end of P4. Rollback before P4: rename archive back, redeploy to Cloudflare, point Clerk at old hostname (~half a day).

## Connects to

- [ADR 0017 — Pivot the MCP server to Rust + axum on Fly.io](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md)
- [ADR 0016 — Portability layer (Justfile + multi-harness AGENTS.md, sunset agent-config)](../../decisions/0016-portability-layer-justfile-multi-harness.md)
- [ADR 0012 — Clerk for prod MCP OAuth](../../decisions/0012-clerk-for-prod-mcp-oauth.md) — auth shape carries over; Worker→axum is just a swap of the resource server
- [ADR 0015 — dotenvx secrets management](../../decisions/0015-dotenvx-secrets-management.md) — carries over; only the deploy-target secret store changes (Cloudflare → Fly)
- [ADR 0003 — Storage split](../../decisions/0003-storage-split.md) — D1+R2 is what we're leaving; Postgres+Tigris (or similar) is the new shape, captured by P1's stack ADRs
- [SPEC.md §1](../../../SPEC.md) — the data model that gets re-encoded in Rust at P2
- All of [scope 1](1-client-ledger.md), [scope 2](2-bidding.md), [scope 3](3-schedule-deps.md), [scope 4](4-sub-onboarding.md), [scope 5](5-payments.md) — gated on this scope landing
