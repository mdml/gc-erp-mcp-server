# Dogfood guide — environments and tooling

How to run, reset, and configure the gc-erp MCP server locally and in production.
Two targets exist; all tooling is aware of both.

## Two targets

| | `local` | `prod` |
|---|---|---|
| **URL** | `http://localhost:8787/mcp` | `https://gc.leiserson.me/mcp` |
| **Runtime** | `wrangler dev` (hot-reload) | Deployed Cloudflare Worker |
| **Database** | Local D1 file — `.wrangler/state/v3/d1/` | Live D1 (`gc-erp`) in Cloudflare |
| **Auth** | Static bearer — `MCP_BEARER_TOKEN=dev` from `wrangler.jsonc` `vars` | **OAuth 2.1 + DCR via Clerk** (hosted consent — see [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)) |
| **Cost to touch** | Free — no real data at risk | Real data; writes are permanent |
| **When to use** | Tool development, scenario runs, iteration | Actual GC work, dogfood sessions, client config |

**Principle: local for experiments, prod for real work.**
Local is cheap and resettable. Prod is where the job history lives.

## Auth story

The two targets use different auth mechanisms on purpose — see [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md) for the full rationale.

- **Local:** static `Authorization: Bearer dev` header. The token `dev` is a public literal baked into committed `apps/mcp-server/wrangler.jsonc` `vars` (per [ADR 0015](../decisions/0015-dotenvx-secrets-management.md)); not a real secret; never rotated. `wrangler dev` reads `vars` automatically. `install:mcp:local` writes the header directly into the Desktop config — no secret lookup, nothing sensitive in the file. The constant-time bearer compare (`timingSafeEqual` in `apps/mcp-server/src/auth.ts`) runs only when `env.CLERK_SECRET_KEY` is unset.
- **Prod:** OAuth 2.1 with Dynamic Client Registration. The Worker proxies Clerk's `/.well-known/oauth-authorization-server` discovery doc (pointing clients at Clerk's hosted `/oauth/authorize`, `/oauth/token`, `/oauth/register`) and serves its own Clerk-shaped `/.well-known/oauth-protected-resource` metadata. MCP clients (Claude Desktop and claude.ai alike) fetch the metadata, register themselves via DCR, **redirect through Clerk's hosted consent page** (Clerk hosts the sign-in + scope approval UI — the Worker never renders one), and receive a Clerk-minted access token. The Worker validates that JWT on every `/mcp*` request via `@clerk/backend`'s `authenticateRequest({ acceptsToken: "oauth_token" })`; tool handlers read `userId` / `scopes` / `clientId` via `getMcpAuthContext().auth`.

**Why the split:** claude.ai Custom Connectors on web + iOS + Android reject static bearer headers — they implement the MCP OAuth spec strictly. Claude Desktop historically accepted bearer headers, but with OAuth available it should use OAuth too (cleaner, per-user identity, works across all Claude surfaces). Local stays on bearer because the scenario runner is server-to-server and OAuth'ing every script invocation adds setup cost for no real security benefit — local D1 has no real data.

Scripts that talk to prod (e.g. `scenario kitchen --target prod`) acquire a Clerk-minted access token once (via the `scenario auth` helper — deferred to a future coding slice) and cache it in a gitignored token file. If a script needs a token and none is cached, it should fail loudly with a message telling the operator to run `scenario auth`.

## Script surface

All scripts live in root `package.json` and delegate to `packages/dev-tools` or `wrangler`. The `:local` / `:prod` suffix is the canonical target indicator.

### Database — migrations

```
bun run db:migrate:local    # wrangler d1 migrations apply gc-erp --local
bun run db:migrate:prod     # wrangler d1 migrations apply gc-erp --remote
```

`db:migrate:prod` is the same as the legacy `db:migrate:remote` alias kept in `apps/mcp-server`. Prefer the root script going forward.

### Database — seeding

```
bun run db:seed:activities:local    # INSERT 22 starter activities into local D1 (idempotent)
bun run db:seed:activities:prod     # Same → remote (shows plan, requires y/N or --yes)

bun run db:seed:kitchen:local       # SPEC §2 kitchen walkthrough fixture (was: seed:kitchen-fixture)
```

`db:seed:activities:*` is idempotent — `ON CONFLICT (slug) DO NOTHING`. Safe to run multiple times. The prod variant prints a plan and prompts before executing (see [Plan + confirm pattern](#plan--confirm-pattern)).

> **`db:seed:kitchen:local` is wired but not yet functional.** The script exists at the new name, but its handler still exits with "D1 provisioning pending" — the seeder logic (`packages/database/src/seed/kitchen-fixture.ts`) runs against better-sqlite3 in tests only. Rewiring it to D1 via the same `wrangler d1 execute --file` path as `db:seed:activities:{local,prod}` is tracked in [backlog.md §Dev tooling](../product/backlog.md).

No `db:seed:kitchen:prod` — the kitchen fixture is synthetic test data, not real-work data.

### Database — ad-hoc queries

```
bun run db:query:local "SELECT count(*) FROM activities"
bun run db:query:prod  "SELECT count(*) FROM activities"
```

`db:query:prod` warns and requires confirmation before executing any query containing `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, or `INSERT`. Pass `--yes` to skip the prompt in scripted contexts.

### Database — reset (local only)

```
bun run db:reset:local              # show plan → y/N → truncate all tables + re-apply migrations
bun run db:reset:local --yes        # same, skip prompt
```

There is intentionally **no `db:reset:prod`**. Resetting prod means deleting real job history. That's an incident-recovery operation, not a routine script. If it ever becomes necessary, run the individual `wrangler d1 execute` commands manually with explicit confirmation at each step.

To "teardown" local entirely (delete the D1 file, start from scratch):
```bash
rm -rf .wrangler/state/v3/d1/
bun run db:migrate:local
```

### Scenarios

```
bun run scenario kitchen                         # runs against local (default)
bun run scenario kitchen --target prod           # runs against prod
bun run scenario kitchen --reset                 # truncate local D1 first, then run
bun run scenario kitchen --target prod --yes     # prod run, skip confirm
```

`--target local|prod` sets the server URL and chooses the right bearer token. Under the hood it sets `MCP_SERVER_URL`; you can also override directly:

```bash
MCP_SERVER_URL=http://localhost:9000/mcp bun run scenario kitchen
```

## Plan + confirm pattern

All destructive or prod-touching scripts follow the same UX:

1. **Print the plan** — always, even with `--yes`.
2. **Prompt `y/N`** — default `N` (safe). Skipped with `--yes`.
3. **Execute.**

Example (`db:reset:local`):

```
This will:
  • truncate 13 tables (projects, jobs, scopes, activities, ...)
  • re-apply 3 migrations

Proceed? [y/N]
```

`--yes` is for non-interactive contexts (CI, scripted chains). Never the default.

## Claude Desktop config (Mac)

Claude Desktop reads `~/Library/Application Support/Claude/claude_desktop_config.json`.
Name both entries so they coexist — you can have local and prod connected simultaneously and address them explicitly in conversation ("create a job in gc-erp-local").

### `install:mcp:local` — writes the config

```
bun run install:mcp:local            # write gc-erp-local entry (backs up existing config first)
bun run install:mcp:local --remove   # remove gc-erp-local entry
```

The script:
1. Reads the existing config (or creates `{}` if none exists).
2. Backs it up to `claude_desktop_config.json.<timestamp>.bak`.
3. Patches in (or removes) the `gc-erp-local` entry.
4. Writes the updated file.
5. Prints "Restart Claude Desktop to apply changes."

The entry it writes:

```json
{
  "mcpServers": {
    "gc-erp-local": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:8787/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer dev"
      }
    }
  }
}
```

The token `dev` is the fixed local literal in `apps/mcp-server/wrangler.jsonc` `vars`. It is not a secret — nothing in local D1 warrants protection.

> **Why `mcp-remote` and not `type: "http"`?** Claude Desktop's `claude_desktop_config.json` only accepts stdio entries today; entries with `type: "http"` (or similar streaming-transport shapes) are rejected as "not a valid MCP server configuration" at Desktop startup. We bridge via the `mcp-remote` npm package, which spawns a local stdio proxy that forwards to our HTTP server with the bearer header attached. The space-less `Authorization:${AUTH_HEADER}` + `AUTH_HEADER: "Bearer dev"` env split works around a Claude-Desktop-on-Windows spaces-in-args bug noted in [mcp-remote's readme](https://github.com/geelen/mcp-remote#readme) — Mac tolerates the space-ful form, but the env-split shape is portable.

> **Why `turbo run dev` stays foreground — no daemon, no binary?** The `localhost:8787` target only answers while `turbo run dev` is running in a terminal, and that's deliberate. Daemonizing via LaunchAgent or wrapping in an on-demand launcher would eliminate the manual-start step but turn the dev server into an invisible background process — exactly where local-vs-prod drift sneaks in. Shipping a true stdio binary would require forking the runtime (no Durable Objects + D1 + R2 outside `workerd`), which breaks the "one Worker ships to prod" invariant in [`apps/mcp-server/CLAUDE.md`](../../apps/mcp-server/CLAUDE.md). Keeping the dev server foreground makes its state visible and its restart intentional, which matches the "local is cheap, resettable, experimental" posture above. Full tradeoffs and rejected options in [ADR 0011](../decisions/0011-local-mcp-dev-server-foreground.md).

### `install:mcp:prod` — prints the connection guide

> **Status: not end-to-end verified.** The Desktop → prod path (`mcp-remote` → Clerk OAuth → tool call) was not exercised during the M2-to-main smoke, because claude.ai web is the critical dogfood path and Desktop-prod is a bonus. The `install:mcp:prod` command still prints a valid-looking Clerk-shaped config block, but the first person to actually use it should expect to debug. Either verify it and delete this callout, or drop Desktop-prod from `install-mcp/patch.ts` entirely.

`bun run install:mcp:prod` prints a JSON block to paste into `~/Library/Application Support/Claude/claude_desktop_config.json`. See [README §Connect from a client](../../README.md#connect-from-a-client) for the user-facing summary. The block uses `mcp-remote` (same stdio bridge as `install:mcp:local`) because Claude Desktop's config file is stdio-only; `mcp-remote` fetches `/.well-known/oauth-authorization-server`, performs DCR against Clerk, pops a browser for Clerk's hosted consent page, and caches the token under `~/.mcp-auth/`.

Gotchas to watch for when/if we verify this path: (a) Desktop's launch-services `PATH` may not include your shell's `nvm`/Homebrew bin — the emitted config pins absolute `/opt/homebrew/bin/npx`, verify that matches your machine; (b) if the consent flow fails, check that `https://gc.leiserson.me/.well-known/oauth-authorization-server` returns valid JSON and that DCR is toggled on in Clerk's OAuth-applications dashboard.

## Claude.ai Connectors (mobile / web)

Claude iOS, Android, and web support remote MCP connectors. In-app: **Settings → Connectors → Add custom connector**.

- **URL:** `https://gc.leiserson.me/mcp`
- **Auth:** leave blank. claude.ai's Custom Connectors only speak OAuth 2.1 + DCR — there's no field for a static bearer token, and that's the reason we adopted Clerk (per [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)).

On first connection, claude.ai fetches `/.well-known/oauth-authorization-server`, registers itself via DCR, redirects you to Clerk's hosted consent page, and once you've signed in + approved scopes, caches the access token. Subsequent sessions refresh silently.

Local dev is not useful from mobile (localhost doesn't resolve on mobile networks). Prod-only on mobile is the right setup.

The web interface at claude.ai supports the same connector configuration under Profile → Connectors.

## First-time local setup

```bash
bun install                         # resolve workspaces
# Per-developer secrets live in `.env.local` via dotenvx (see README §First-time setup).
# `wrangler dev` doesn't need them — MCP_BEARER_TOKEN=dev comes from wrangler.jsonc vars.
bun run dev                         # start wrangler dev (pane A)
bun run db:migrate:local            # apply migrations to local D1
bun run db:seed:activities:local    # seed the 22-activity library (optional but useful)
bun run install:mcp:local           # wire Claude Desktop to localhost:8787
```

Then in pane B:

```bash
bun run scenario kitchen            # smoke-test the Day-0 walkthrough
```

## Prod deploy checklist

Run these in order. Each is independently safe to retry.

1. `bun run db:migrate:prod` — apply pending migrations (idempotent; wrangler shows a diff)
2. `bun run db:seed:activities:prod` — seed starter activities (idempotent)
3. Verify Clerk OAuth secrets + instance config are in place (per [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)):
   - Upload the Clerk secrets via `wrangler secret put` — run from inside `apps/mcp-server/` (wrangler reads `wrangler.jsonc` from the cwd):
     ```bash
     (cd apps/mcp-server && bunx wrangler secret put CLERK_SECRET_KEY)
     (cd apps/mcp-server && bunx wrangler secret put CLERK_PUBLISHABLE_KEY)
     ```
     `wrangler` prompts for the value on stdin; paste the Clerk-issued key. **Do not** use `--var KEY=VAL` — wrangler 4.x parses values into argv, so the secret ends up in shell history / process listings / error output. Past incident (PR #29): `CLERK_SECRET_KEY` leaked to stdout via a malformed `--var` invocation and had to be rotated.
   - Clerk dashboard → OAuth applications → **Dynamic Client Registration toggled on** (so claude.ai can self-register);
   - No `MCP_BEARER_TOKEN` in prod Cloudflare secrets.

   > **Slices that change the names of prod secrets must copy the two `(cd apps/mcp-server && bunx wrangler secret put …)` lines above verbatim** — don't rewrite them from memory. The subshell pattern is load-bearing (wrangler needs the Worker's cwd to find `wrangler.jsonc`), and agent training data sometimes suggests repo-root invocations that fail with "Required Worker name missing." Verbatim-copy is the fix.
4. `bun run deploy` — deploy the Worker (no permission prompt when run from your shell; agent-config policy only intercepts when Claude invokes it)
5. Verify the seed:
   ```bash
   bun run db:query:prod "SELECT count(*) FROM activities"
   ```
   Expect a count of `22` (the starter library).
6. Smoke-test OAuth discovery (no auth required):
   ```bash
   curl -s https://gc.leiserson.me/.well-known/oauth-authorization-server | jq .
   ```
   Expect JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `jwks_uri` (all pointing at Clerk's FAPI). HTTP 404 → handler not wired; HTTP 500 → `CLERK_*` env not set on the Worker.
7. Smoke-test end-to-end:
   ```bash
   bun run scenario kitchen --target prod
   ```
   The prod-confirm prompt prints a plan; type `y`. Expect `✓ scenario completed`.

   This is the load-bearing smoke-test — it exercises the full Day-0 walkthrough (`create_party` → `create_project` → `create_job` → `create_scope` → `apply_patch` → `issue_ntp` → `get_scope_tree`) against live D1 over the real MCP HTTP transport. The scenario runner acquires a Clerk-minted token via the `scenario auth` helper (deferred to a future coding slice) and caches it locally.

   On failure: tail the Worker with `bunx wrangler tail gc-erp-mcp-server --remote` from `apps/mcp-server/` and re-run. HTTP 401 from the runner → token expired or invalid; rerun `bun run scenario auth --target prod`.

> **Why not a one-shot `curl`?** The streaming HTTP transport is stateful — `tools/list` requires an `Mcp-Session-Id` header obtained from a prior `initialize` handshake. A single `curl tools/list` returns HTTP 400 with `Mcp-Session-Id header is required`, which looks like a bug but isn't. If you need a curl-level check, do it as two requests: POST `initialize` (capture `Mcp-Session-Id` from the response headers), then POST `tools/list` carrying that header and a valid Clerk-issued bearer. The scenario runner does both for you.

## Rollback

If a prod deploy fails or reveals a hot bug post-deploy:

```bash
wrangler rollback --name gc-erp-mcp-server
```

This reverts the Worker binary to the previous version. **Migrations stay applied** — they're additive and backwards-compatible, so rollback + migrations-applied is a valid stable state. Before running, flag it in chat — there's no one-click undo beyond `git reflog`.

The previous known-good Worker version is `a9d2268d` (M1 deploy, 2026-04-17).
