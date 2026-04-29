# gc-erp-mcp-server

A lightweight general-contractor ERP whose product is an **MCP server**. It exposes a commitment-based data model, tool methods, and MCP "apps" (UI components) that an MCP client (Claude Desktop, Claude web, Claude mobile) renders and orchestrates. Dogfood-first: built for Max + Salman GC'ing our own projects (~1–5/year), not SaaS.

See [SPEC.md](./SPEC.md) for the data model, a narrative walkthrough, and open questions.

## v1 infra

- **Runtime:** Cloudflare Workers (remote HTTP, reachable from phones).
- **MCP transport:** streamable HTTP via Cloudflare's [`agents`](https://developers.cloudflare.com/agents/) `McpAgent` (each session backed by a Durable Object).
- **Auth:** OAuth 2.1 + DCR via [Clerk](https://clerk.com) in prod (hosted consent for DCR clients — see [ADR 0012](docs/decisions/0012-clerk-for-prod-mcp-oauth.md)); static bearer token in local dev.
- **Tools (v0.0.1):** `ping`, `list_jobs` (returns `[]`).

## Layout

Turbo monorepo:

- `apps/mcp-server/` — the Cloudflare Worker (MCP server). Runtime code.
- `packages/dev-tools/` — Bun-based internal tools (gate runner, code-health CLI, scenario runner, db helpers).
- `packages/agent-config/` — single source of truth for Claude Code permissions. Writes `.claude/settings.json` on every `bun install` (see [its CLAUDE.md](packages/agent-config/CLAUDE.md) to change the policy).

Secrets are managed per-developer via [dotenvx](https://dotenvx.com) (per [ADR 0015](docs/decisions/0015-dotenvx-secrets-management.md)). Each developer maintains their own:

- `/.env.local` — encrypted dotenv body (per-value ECIES ciphertext). Gitignored.
- `/.env.keys` — matching private key. Gitignored.

Both auto-generated on the first `bunx dotenvx set` against a missing `.env.local`. Decryption is per-process — `bunx dotenvx run -f .env.local -- <cmd>` injects vars into one subprocess and exits; the parent shell never holds plaintext.

`MCP_BEARER_TOKEN` for local dev is a fixed public literal (`"dev"`) and lives in committed `apps/mcp-server/wrangler.jsonc` `vars` — not encrypted, not a secret.

## First-time setup

Prereqs (install once, per machine):

```bash
brew install bun lefthook osv-scanner   # macOS
npm i -g @codescene/codescene-cli       # `cs` — Code Health CLI (required for commits/pushes)
# Linux: apt-get install lefthook; install bun, osv-scanner per their docs
```

Then:

```bash
bun install   # workspaces resolve; installs turbo + wrangler + dotenvx
```

Seed your secrets — ask Max (or another existing operator) for the four shared values; the per-developer ones (`CS_ACCESS_TOKEN`, `GH_TOKEN`) come from your own CodeScene seat / GitHub PAT:

```bash
bunx dotenvx set CLOUDFLARE_API_TOKEN  '<value>' -f .env.local   # required for `wrangler deploy`
bunx dotenvx set CLOUDFLARE_ACCOUNT_ID '<value>' -f .env.local   # required for `wrangler deploy`
bunx dotenvx set CLERK_SECRET_KEY      '<value>' -f .env.local   # only for `wrangler secret put` rotations
bunx dotenvx set CLERK_PUBLISHABLE_KEY '<value>' -f .env.local   # only for `wrangler secret put` rotations
bunx dotenvx set CS_ACCESS_TOKEN       '<value>' -f .env.local   # required for commits/pushes (code-health gate)
bunx dotenvx set GH_TOKEN              '<value>' -f .env.local   # for `gh` CLI
```

The first call against a missing `.env.local` auto-generates a fresh keypair: it writes `DOTENV_PUBLIC_KEY_LOCAL=…` into `.env.local` and the matching `DOTENV_PRIVATE_KEY_LOCAL=…` into `.env.keys`. Both files are gitignored. Subsequent calls reuse the same keypair.

To rotate a value, re-run `bunx dotenvx set NAME NEW_VALUE -f .env.local`. Each developer's `.env.local` is encrypted only to their own public key — when a shared token rotates, exchange the new value out-of-band and re-`set` locally on each machine.

Node version is pinned via `.nvmrc` (currently `24`, the active LTS). If you use `nvm` / `fnm` / `mise` / `asdf`, they'll auto-switch on `cd` into the repo. If you upgrade your local Node (or Bun) and then `bun run gate` fails with `The module … was compiled against a different Node.js version … NODE_MODULE_VERSION`, a cached native binding (most likely `better-sqlite3`) is stale against the new ABI. `bun install` is a no-op against an unchanged lockfile, so the cache doesn't refresh on its own — run `bun install --force` to pull a fresh prebuild.

## Local dev

```bash
turbo run dev                # wrangler dev in apps/mcp-server — usually http://localhost:8787
```

Smoke test (the local bearer is the literal `"dev"`, baked into `wrangler.jsonc` `vars`):

```bash
curl http://localhost:8787/                                           # banner
curl -i http://localhost:8787/mcp                                     # 401
curl -s -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploy

Wrangler picks up `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from the env — no `wrangler login`, so this repo stays isolated from other Cloudflare-using repos on the same machine. `apps/mcp-server/wrangler.jsonc` also pins `account_id`, so a wrong `CLOUDFLARE_ACCOUNT_ID` fails loudly instead of cross-deploying.

Wrap deploy in `bunx dotenvx run` so wrangler inherits the credentials from your encrypted `.env.local`:

```bash
bunx dotenvx run -f .env.local -- turbo run deploy
```

Serves at `https://gc.leiserson.me`; the MCP path is `/mcp`. The `*.workers.dev` fallback is disabled in `wrangler.jsonc` so there's a single canonical hostname.

**One-time per environment**: the Clerk OAuth credentials need to be uploaded as Cloudflare secrets so the deployed Worker can validate incoming JWTs. Do this once (and whenever they rotate). The values live in your `.env.local`; pipe them through `dotenvx get` so they never touch shell history:

```bash
bunx dotenvx get CLERK_SECRET_KEY      -f .env.local | (cd apps/mcp-server && bunx dotenvx run -f ../../.env.local -- bunx wrangler secret put CLERK_SECRET_KEY)
bunx dotenvx get CLERK_PUBLISHABLE_KEY -f .env.local | (cd apps/mcp-server && bunx dotenvx run -f ../../.env.local -- bunx wrangler secret put CLERK_PUBLISHABLE_KEY)
```

This is the intentional out-of-band step — not automated in v1. No `MCP_BEARER_TOKEN` is uploaded to prod; the bearer path only runs under `wrangler dev`.

## Connect from a client

Add a custom connector / remote MCP server pointing at `https://gc.leiserson.me/mcp`. The client shape differs by platform:

- **claude.ai (web + iOS + Android):** paste the URL into Settings → Connectors → Add custom connector. Auth field stays blank — claude.ai speaks MCP OAuth + DCR natively. **This is the verified dogfood path.**
- **Claude Desktop (Mac):** *Unverified end-to-end.* Desktop's config file is stdio-only, so it connects via the `mcp-remote` bridge (which itself speaks the MCP OAuth flow). `bun run install:mcp:prod` prints a JSON block to paste. The path wasn't smoke-tested for the M2 merge (claude.ai was the critical path); first use should expect to debug — see [`docs/guides/dogfood.md` §`install:mcp:prod`](docs/guides/dogfood.md#installmcpprod--prints-the-connection-guide).

For claude.ai the first connection pops a browser for Clerk's hosted consent page: sign in (or sign up) with whatever method you enabled on the Clerk instance, approve the scopes. See [ADR 0012](docs/decisions/0012-clerk-for-prod-mcp-oauth.md) for why static bearer headers don't work with claude.ai and why Clerk hosts the consent UI end-to-end.

## Scripts (root)

- `turbo run dev` — local Worker via Wrangler
- `turbo run deploy` — ship to Cloudflare
- `turbo run typecheck` — tsc --noEmit across all packages
- `turbo run lint` — biome check across all packages
- `bun run format` — biome check --write --unsafe . (auto-fix at the repo root)
- `turbo run test` — vitest across all packages
- `turbo run test:coverage` — vitest with v8 line-coverage enforcement per package
- `bun run gate` — full quality gate (lint + typecheck + test + Code Health); `bun run gate -- --coverage` adds coverage enforcement (pre-push default)
- `turbo run tail` — stream production logs
- `bun run code-health` — score the whole repo via CodeScene (sanity check; same gate that runs in lefthook hooks)

## Quality gates

`bun install` runs `lefthook install` **and** `install-agent-config` via the `prepare` script. That wires four git hooks and regenerates `.claude/settings.json` from `packages/agent-config`:

- **pre-commit** — `turbo run lint`, `turbo run typecheck`, and `bash scripts/codescene.sh gate-check` over each staged source file (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`, **including** `*.test.*` and dev-tools — every TypeScript file in the staged set must score ≥ 10). Biome handles both lint and format from `biome.json`; run `bun run format` to auto-fix anything Biome flags.
- **commit-msg** — `commitlint` enforces [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, …). Allowed types are the standard set; no research-specific extensions.
- **pre-push** — three checks in parallel: `bun run gate -- --coverage` (lint + typecheck + test-with-coverage), `osv-scanner` against `bun.lock` for known vulnerabilities, and `bash scripts/codescene.sh gate-check` over **every** TS/JS file modified on the branch vs `origin/main`.
- **post-checkout** — `packages/agent-config/bootstrap` runs `bun install` and re-installs `.claude/settings.json`. Per [ADR 0015](docs/decisions/0015-dotenvx-secrets-management.md), per-developer `.env.local` and `.env.keys` are listed in `.worktreeinclude` and copy in alongside the worktree — no secret-sync step needed. Note: `claude --worktree` branches the new worktree from `origin/HEAD` (not your current local branch) and there's no flag to override — if you're continuing work on a local feature branch, tell the agent which branch to base off and it'll fetch + align per the root `CLAUDE.md`.
- **Code Health (CodeScene)**: every TypeScript file (source + tests + dev-tools, no exclusions) in the staged set or branch diff must score ≥ 10.0. Requires the `cs` CLI (`npm i -g @codescene/codescene-cli`) and a valid `CS_ACCESS_TOKEN` in your `.env.local` (`bunx dotenvx set CS_ACCESS_TOKEN <value> -f .env.local`). The bash wrapper at [`scripts/codescene.sh`](scripts/codescene.sh) sources the token via `bunx dotenvx get` and exports it before `cs check` — sequential per file, by design (parallel cs spawning from inside lefthook + bun deadlocked in earlier attempts). A missing CLI, unset token, or auth/connection failure hard-fails both the pre-commit and pre-push hooks. Contributing to this repo requires a CodeScene seat. Sanity-check the whole repo any time with `bun run code-health` (calls `bash scripts/codescene.sh gate-all`).
- **Test coverage**: vitest enforces `lines: 90` (overall) and `lines: 70` (per-file glob) per package. Exclusions live in each package's `vitest.config.ts` — subprocess orchestrators and thin CLI entries are excluded rather than mocked.

Bun's lockfile is text-mode and `bunfig.toml` pins versions exactly with a 7-day minimum release age (supply-chain hardening — see the `minimumReleaseAgeExcludes` list for the few packages currently exempt because their locked version is fresher than the policy).
