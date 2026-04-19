---
type: ADR
id: "0011"
title: "Local MCP dev server runs foreground, not daemonized"
status: active
date: 2026-04-19
---

## Context

Claude Desktop's local `gc-erp-local` entry ([`patch.ts`](../../packages/dev-tools/src/install-mcp/patch.ts)) bridges stdio to HTTP via `mcp-remote` pointed at `http://localhost:8787/mcp`. That URL is only alive while `turbo run dev` is running in a terminal — which means MCP calls from Claude Desktop fail whenever the dev server isn't manually started. Audit question (2026-04-19): "can't we set it up so it points to the repo and runs a script, or install a binary in `~/.local`, so we don't need `turbo run dev` running?"

Three concrete shapes exist for eliminating the manual foreground step. The question is whether any of them are worth the cost. The surrounding constraints:

- **The Worker runtime can't be replaced locally** — `GcErpMcp` uses Durable Objects + D1 + R2 bindings that only exist inside `workerd`. There is no pure Node version of this server to compile. Any "binary" would have to re-implement the runtime's storage boundaries.
- **`mcp-remote` is load-bearing** — Claude Desktop's `claude_desktop_config.json` only accepts stdio entries (dogfood guide §"Why `mcp-remote` and not `type: http`?"). Every option below keeps this bridge in place.
- **Dogfood is two operators** — Max + Salman, each on their own Mac. The setup is evaluated on one-person-ergonomics, not team-scale polish.

## Decision

**Keep the local dev server as a manually-started foreground process (`turbo run dev` in a terminal). Do not daemonize, do not wrap in an auto-spawning launcher, do not ship a standalone binary.** The lifecycle cost is a feature: local is an experimental surface where schema shifts, migrations reset, and behavior changes; running the server foreground keeps its state visible and its restart intentional.

The Claude Desktop config produced by `bun run install:mcp:local` stays as-is: `mcp-remote` → `localhost:8787/mcp` → fails loudly when the dev server isn't up.

## Options considered

- **A (chosen): foreground `turbo run dev`.** Status quo. One terminal tab owns the dev server. Zero new moving parts; logs stream to that tab; starting/stopping is a human act. Cost: an extra Cmd-Tab when dogfooding.
- **B: macOS LaunchAgent.** `~/Library/LaunchAgents/me.leiserson.gc-erp.plist` runs `bun run --cwd <repo> dev` at login with `KeepAlive=true`; logs to `~/Library/Logs/gc-erp/`. Claude Desktop config unchanged. **Rejected** because (a) wrangler dev is designed foreground — holding it up as a permanent background process turns every schema change + hot-reload into an invisible event, which is exactly where local-vs-prod drift sneaks in; (b) opacity breaks the dogfood loop — the point of local is to *notice* what's happening to your data while you work, not to forget the server exists; (c) ~100MB RAM permanently resident on a dev machine per-repo, multiplied across the MCP-server portfolio this repo is a template for ([ADR 0010](0010-stytch-oauth-for-prod-mcp.md) Advice); (d) lifecycle edge cases — a crash means silent failure instead of a visible "the process died" signal.
- **C: on-demand launcher script at `~/.local/bin/gc-erp-mcp`.** Claude Desktop's `command` becomes the launcher, which health-checks `:8787`, spawns `wrangler dev` in the background if dead, waits for ready, execs `mcp-remote`. **Rejected** because it's option B plus lifecycle hell: who kills wrangler when Claude Desktop quits? Usually nobody, so the backgrounded wrangler becomes a zombie daemon anyway — reinventing option B with worse state.
- **D: standalone stdio MCP server binary.** Replace the Worker runtime locally with a Node/Bun runtime + SQLite-on-disk (no DO, no D1, no R2), `bun build --compile` to `~/.local/bin/gc-erp-mcp`, Claude Desktop spawns directly. **Rejected** because it forks the runtime — business logic has to work on both `workerd` (prod) and Bun (local), with two storage backends to keep consistent. Violates the [`packages/mcp-server/CLAUDE.md`](../../packages/mcp-server/CLAUDE.md) invariant that the Worker is the one runtime that ships, and the whole point of wrangler dev (same `workerd` as prod) is that local and prod share bugs.

## Consequences

**Easier:**

- Local state is always visible — the dev server's tail is a channel for "I just dropped the D1 file; here's what the migration applied; here's what `list_jobs` returned." That channel disappears under daemonization.
- Zero new moving parts to maintain. No plist, no launcher script, no extra install path, no "wait, why is there a gc-erp process in Activity Monitor?" moments.
- First-time setup guide stays linear: `bun run dev`, `bun run install:mcp:local`, done ([dogfood.md §First-time local setup](../guides/dogfood.md)). No "optional daemon mode" fork to explain.
- Reinforces the local-vs-prod split in [dogfood.md](../guides/dogfood.md): local is cheap, resettable, experimental; the one-terminal-tab ceremony matches that posture.

**Harder:**

- Opening Claude Desktop without `turbo run dev` running → MCP calls fail. `mcp-remote`'s error surfaces in Desktop logs but is easy to miss. Mitigation: the failure mode is visible and recoverable (start the server, restart the MCP session); no data loss.
- If the dogfood loop grows into a daily-driver flow where local is queried many times per day across app restarts, the "start the server first" tax compounds. Revisit then.

**Trigger for re-evaluation:**

- Either operator reports the manual-start step is materially slowing them down in real dogfood sessions (as opposed to during one-off audits like this one).
- A second MCP-server repo in the portfolio adopts a daemonized pattern and we want cross-repo consistency — at which point we'd likely port B or a variant back to this repo.
- Claude Desktop gains first-class HTTP MCP support, eliminating `mcp-remote` from the chain — might open options the current stdio-only shape closes off.

## Advice

Audit-surfaced during a session 2026-04-19 (this conversation). Max framed the "intentionality as a feature" argument and chose to keep the setup as-is, with the decision documented so the question doesn't re-surface uninformed.
