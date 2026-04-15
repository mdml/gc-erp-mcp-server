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

Secrets live in 1Password (vault `Shared-gc-erp`). The declarative list of what
we need and where to fetch it is `packages/dev-tools/src/secrets.config.ts`.
`turbo run sync-secrets` reads that list and writes two local artifacts:

- `/.envrc.enc` — age-encrypted dotenv, per-developer, auto-loaded by direnv on `cd`.
- `/packages/mcp-server/.dev.vars` — plaintext for `wrangler dev`, gitignored.

Re-run `sync-secrets` to rotate.

## First-time setup

Prereqs (install once, per machine):

```bash
brew install age direnv 1password-cli bun     # macOS
# Linux: apt-get install age direnv; install op + bun per their docs
```

Create your age keypair if you don't already have one:

```bash
mkdir -p "$HOME/.config/sops/age"
age-keygen -o "$HOME/.config/sops/age/keys.txt"
```

Sign in to 1Password (`op signin`) and make sure you have access to the
`Shared-gc-erp` vault. Then:

```bash
bun install                  # workspaces resolve; installs turbo + wrangler
turbo run sync-secrets       # pulls from 1Password → .envrc.enc + .dev.vars
direnv allow                 # one-time; direnv will now auto-load on cd
```

After `direnv allow`, every new shell at the repo root gets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `MCP_BEARER_TOKEN` exported automatically. Rotate by re-running `turbo run sync-secrets` + `direnv reload`.

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
- `turbo run tail` — stream production logs
- `turbo run sync-secrets` — pull secrets from 1Password
