# gc-erp-mcp-server

A lightweight general-contractor ERP whose product is an **MCP server**. It exposes a commitment-based data model, tool methods, and MCP "apps" (UI components) that an MCP client (Claude Desktop, Claude web, Claude mobile) renders and orchestrates. Dogfood-first: built for Max + Salman GC'ing our own projects (~1–5/year), not SaaS.

See [SPEC.md](./SPEC.md) for the data model, a narrative walkthrough, and open questions.

## v1 infra

- **Runtime:** Cloudflare Workers (remote HTTP, reachable from phones).
- **MCP transport:** streamable HTTP via Cloudflare's [`agents`](https://developers.cloudflare.com/agents/) `McpAgent` (each session backed by a Durable Object).
- **Auth:** bearer token. Shared between Max + Salman via 1Password.
- **Tools (v0.0.1):** `ping`, `list_jobs` (returns `[]`).

## Layout

Turbo monorepo:

- `packages/mcp-server/` — the Cloudflare Worker (MCP server). Runtime code.
- `packages/dev-tools/` — Bun-based internal tools. Currently ships `sync-secrets`.

Secrets come from 1Password in two flavors:

- **Team secrets** (shared, vault `gc-erp`): baked into `packages/dev-tools/src/secrets.config.ts` with exact `op://` refs. Required — `sync-secrets` hard-fails if one can't be resolved.
- **Developer secrets** (per-person): the project declares only the name and what each secret enables; every developer maps names to their own `op://` refs in `.env.op.local` (gitignored). `sync-secrets` warns-and-skips missing refs, but downstream consumers may still require the value (e.g. `CS_ACCESS_TOKEN` is required for the Code Health gate).

`turbo run sync-secrets` writes two local artifacts:

- `/.envrc.enc` — age-encrypted dotenv, per-developer, auto-loaded by direnv on `cd`.
- `/packages/mcp-server/.dev.vars` — plaintext for `wrangler dev`, gitignored.

Re-run `sync-secrets` to rotate.

## First-time setup

Prereqs (install once, per machine):

```bash
brew install age direnv 1password-cli bun lefthook osv-scanner   # macOS
npm i -g @codescene/codescene-cli                                 # `cs` — Code Health CLI (optional but recommended)
# Linux: apt-get install age direnv lefthook; install op, bun, osv-scanner per their docs
```

Create your age keypair if you don't already have one:

```bash
mkdir -p "$HOME/.config/sops/age"
age-keygen -o "$HOME/.config/sops/age/keys.txt"
```

Sign in to 1Password (`op signin`) and make sure you have access to the
`gc-erp` vault. Optionally, set up personal refs for per-developer
secrets (CodeScene seat, GitHub token) — these unlock optional gates without
blocking anyone who skips them:

```bash
cp .env.op.local.example .env.op.local   # gitignored; fill in your personal refs
```

Then:

```bash
bun install                  # workspaces resolve; installs turbo + wrangler
turbo run sync-secrets       # team secrets (required) + developer secrets (best-effort)
direnv allow                 # one-time; direnv will now auto-load on cd
```

After `direnv allow`, every new shell at the repo root gets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MCP_BEARER_TOKEN`, plus any developer secrets you provided refs for. Rotate by re-running `turbo run sync-secrets` + `direnv reload`.

## Local dev

```bash
turbo run dev                # wrangler dev in packages/mcp-server — usually http://localhost:8787
```

Smoke test (the bearer comes from `.dev.vars` and the direnv-exported env):

```bash
curl http://localhost:8787/                                           # banner
curl -i http://localhost:8787/mcp                                     # 401
curl -s -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploy

Wrangler picks up `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from the env — no `wrangler login`, so this repo stays isolated from other Cloudflare-using repos on the same machine.

```bash
turbo run deploy
```

Returns a URL like `https://gc-erp-mcp-server.<account>.workers.dev`. The MCP path is `/mcp`.

**One-time per environment**: the bearer value lives in 1Password and needs to be uploaded as a Cloudflare secret so the deployed Worker can authenticate requests. Do this once (and whenever the bearer rotates):

```bash
cd packages/mcp-server
echo -n "$MCP_BEARER_TOKEN" | npx wrangler secret put MCP_BEARER_TOKEN
```

(This is the intentional out-of-band step — not automated in v1.)

## Connect from a client

Add a custom connector / remote MCP server pointing at `https://…workers.dev/mcp`, with `Authorization: Bearer <token>` as the auth header. Exact steps depend on the client (Claude Desktop, Claude web, Claude mobile). Once connected, `ping` and `list_jobs` show up in the tool list.

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
- `turbo run sync-secrets` — pull secrets from 1Password

## Quality gates

`bun install` runs `lefthook install` via the `prepare` script, which wires three git hooks:

- **pre-commit** — `turbo run lint`, `turbo run typecheck`, and `cs check` over staged source files (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`, minus `*.test.*`/`*.spec.*`). Biome handles both lint and format from `biome.json`; run `bun run format` to auto-fix anything Biome flags.
- **commit-msg** — `commitlint` enforces [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, …). Allowed types are the standard set; no research-specific extensions.
- **pre-push** — runs `bun run gate -- --coverage` (lint + typecheck + test-with-coverage + Code Health over branch-changed files) and then `osv-scanner` against `bun.lock` for known vulnerabilities.
- **Code Health (CodeScene)**: every changed source file must score ≥ 10.0. Requires the `cs` CLI (`npm i -g @codescene/codescene-cli`) and a valid `CS_ACCESS_TOKEN` — a per-developer secret (add its 1Password ref to `.env.op.local` and re-run `turbo run sync-secrets`). A missing CLI, unset token, or auth/connection failure hard-fails both the pre-commit hook and the pre-push gate. Contributing to this repo requires a CodeScene seat.
- **Test coverage**: vitest enforces `lines: 80` (overall) and `lines: 60` (per-file glob) per package. Exclusions live in each package's `vitest.config.ts` — subprocess orchestrators and thin CLI entries are excluded rather than mocked.

Bun's lockfile is text-mode and `bunfig.toml` pins versions exactly with a 7-day minimum release age (supply-chain hardening — see the `minimumReleaseAgeExcludes` list for the few packages currently exempt because their locked version is fresher than the policy).
