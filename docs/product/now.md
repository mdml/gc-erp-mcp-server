# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** Pivot ADRs landed (active). [ADR 0016](../decisions/0016-portability-layer-justfile-multi-harness.md) — portability layer (Justfile + multi-harness AGENTS.md, sunset `agent-config`); independently motivated, ships first. [ADR 0015](../decisions/0015-pivot-mcp-server-to-rust-on-fly.md) — rebuild the MCP server in Rust + axum on Fly.io, sequenced as four phases (P1 POC → P2 hand-coded data model → P3 tools to parity → P4 cutover). Together they reset the technical foundation while leaving product milestones M4–M6 (job dashboard, pay app, real-job dogfood) intact for the new stack. Updating `docs/product/scope.md` next, before starting any implementation work.

## Up next

1. **Refresh [`docs/product/scope.md`](scope.md)** to reflect the post-pivot stack and incorporate dogfooding-driven scope ideas. Pre-implementation step.
2. **PR `slice/cost-entry-form` → `main`, rebase-merge, delete branch.** Close out the pre-pivot M3 history cleanly so the archive rename (at start of P1) doesn't entangle in-flight TS work.
3. **Build the portability layer** (per [ADR 0016](../decisions/0016-portability-layer-justfile-multi-harness.md), one slice, can be parallel-worktreed):
   - Justfile at root: `just check`, `just test`, `just bootstrap`, `just deploy`. Recipes shell out to current `bun` / `turbo`; Rust recipes added at P1.
   - Zed configured for multi-agent (Claude Code + Codex). Capture in `docs/guides/zed-multi-agent.md`.
   - `AGENTS.md` symlinked to `CLAUDE.md`.
   - Sunset `packages/agent-config` (delete + remove `bun install` hook).
4. **Start P1 — Rust-MCP POC** (per [ADR 0015](../decisions/0015-pivot-mcp-server-to-rust-on-fly.md)): rename `apps/mcp-server/` → `apps/mcp-server.ts-archive/`; stamp dogfood/M3-era docs as superseded; spike `axum` + `rmcp` + Clerk JWT + `sqlx`/Postgres deployed to Fly.io; write [`docs/guides/rust-mcp.md`](../guides/rust-mcp.md).

## In flight

*(nothing — ADRs landed, scope refresh next)*

## Waiting on

*(nothing)*

## Recently done

- **ADRs 0015 and 0016 landed active** (2026-05-11): pivot the MCP server to Rust + axum on Fly.io (0015, four phases P1–P4 with P2 hand-coded for the data model + valid-states layer); adopt Justfile + multi-harness AGENTS.md and sunset `packages/agent-config` (0016, independently motivated by vendor lock-in / Anthropic reliability concerns). Rust justified on three project-specific grounds: type system + compiler for the complex data model (largest payoff), safety by construction for the M5/M6 money-bearing artifacts, throughput headroom if we scale. Biggest known tradeoff (UI ecosystem gap) doesn't bite — language boundary sits at HTTP, future UI lives as React+TS+shadcn talking to the Rust backend. OAuth verified portable — Clerk is the AS, Worker is just the resource server validating JWT.
- **M3 dogfood landed** (slice/cost-entry-form, 2026-04-20): Desktop dogfood verified all five guide §7 rows (iframe render, `App` + `PostMessageTransport` handshake, missing-ID UX, Save happy path → `cost_wVsblVEW_Js1jCgecaOmn` in D1, Save attestation rejects chat-driven submit). Bug caught mid-dogfood: §6.8's `oninitialized`-deferred registration didn't advertise `resources` capability — fixed in [PR #38](https://github.com/mdml/gc-erp-mcp-server/pull/38), guide corrected. Desktop in-session cache invalidation deferred to [backlog](backlog.md#runtime--mcp).
- **M3 build phase landed on slice** ([PR #36](https://github.com/mdml/gc-erp-mcp-server/pull/36) SDK wire-up, [PR #37](https://github.com/mdml/gc-erp-mcp-server/pull/37) view scaffold, integration commit, 2026-04-20): `cost_entry_form` app tool registered via `@modelcontextprotocol/ext-apps@1.6.0`; Vite singlefile view with Save-button attestation (`e.isTrusted` + `canSave`); `PostMessageTransport` signature drift caught and fixed in the vendor guide during review.
- **MCP Apps vendor guide landed** ([PR #35](https://github.com/mdml/gc-erp-mcp-server/pull/35), 2026-04-20): POC-driven verification of `@modelcontextprotocol/ext-apps@1.6.0`; closed 5 spike-claim deltas (most load-bearing: wrangler split-assets landmine §6.4, `getUiCapability` call-site correction §6.8). First exercise of the new vendor-guide convention; seeds ADR 0014.
