# Dogfood guide — environments and tooling

How to run, reset, and configure the gc-erp MCP server locally and in production.
Two targets exist; all tooling is aware of both.

## Two targets

| | `local` | `prod` |
|---|---|---|
| **URL** | `http://localhost:8787/mcp` | `https://gc.leiserson.me/mcp` |
| **Runtime** | `wrangler dev` (hot-reload) | Deployed Cloudflare Worker |
| **Database** | Local D1 file — `.wrangler/state/v3/d1/` | Live D1 (`gc-erp`) in Cloudflare |
| **Bearer token** | `MCP_BEARER_TOKEN` from `.dev.vars` | `MCP_BEARER_TOKEN` from 1Password `gc-erp` vault (loaded by direnv) |
| **Cost to touch** | Free — no real data at risk | Real data; writes are permanent |
| **When to use** | Tool development, scenario runs, iteration | Actual GC work, dogfood sessions, client config |

**Principle: local for experiments, prod for real work.**
Local is cheap and resettable. Prod is where the job history lives.

## Bearer token story

Both targets share the same env-var name (`MCP_BEARER_TOKEN`) and the server checks it on every request — but the values have different weight:

- **Local:** the fixed string `dev`. Hardcoded in `.dev.vars`; not a real secret; never rotated. `wrangler dev` loads `.dev.vars` automatically. `install:mcp:local` writes `Authorization: Bearer dev` directly into the Desktop config — no secret lookup, nothing sensitive in the file.
- **Prod:** a real random secret stored in 1Password `gc-erp` vault → decrypted into `.envrc.enc` → loaded by `direnv` on shell entry. Available in your terminal as `$MCP_BEARER_TOKEN` whenever `direnv` is active. Never printed to stdout by any script.

The auth code path is exercised in both environments (invariant: every `/mcp*` request is bearer-checked). The local token is trivial by design — local D1 holds no real data, so there is nothing worth protecting. The prod token is real and treated accordingly.

Scripts that talk to prod read `$MCP_BEARER_TOKEN` from the environment. They do not hard-code tokens or print them. If a script needs the token and it isn't set, it should fail loudly with a message pointing at `direnv allow`.

## Script surface

All scripts live in root `package.json` and delegate to `packages/dev-tools` or `wrangler`. The `:local` / `:prod` suffix is the canonical target indicator.

### Database — migrations

```
bun run db:migrate:local    # wrangler d1 migrations apply gc-erp --local
bun run db:migrate:prod     # wrangler d1 migrations apply gc-erp --remote
```

`db:migrate:prod` is the same as the legacy `db:migrate:remote` alias kept in `packages/mcp-server`. Prefer the root script going forward.

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

The token `dev` is the fixed local value from `.dev.vars`. It is not a secret — nothing in local D1 warrants protection.

> **Why `mcp-remote` and not `type: "http"`?** Claude Desktop's `claude_desktop_config.json` only accepts stdio entries today; entries with `type: "http"` (or similar streaming-transport shapes) are rejected as "not a valid MCP server configuration" at Desktop startup. We bridge via the `mcp-remote` npm package, which spawns a local stdio proxy that forwards to our HTTP server with the bearer header attached. The space-less `Authorization:${AUTH_HEADER}` + `AUTH_HEADER: "Bearer dev"` env split works around a Claude-Desktop-on-Windows spaces-in-args bug noted in [mcp-remote's readme](https://github.com/geelen/mcp-remote#readme) — Mac tolerates the space-ful form, but the env-split shape is portable.

### `install:mcp:prod` — prints the connection guide

Prod credentials are never written to disk by a script. Run:

```
bun run install:mcp:prod
```

The output prints a JSON block for `~/Library/Application Support/Claude/claude_desktop_config.json` (alongside any `gc-erp-local` entry) and a note about the not-yet-supported claude.ai path. Replace the bearer placeholder with your `MCP_BEARER_TOKEN` from 1Password `gc-erp` vault and restart Claude Desktop.

The bearer is always rendered as the literal placeholder `<your MCP_BEARER_TOKEN>` — never interpolated from `$MCP_BEARER_TOKEN`.

After restart, ask Claude in a fresh conversation to "list my jobs" — should call `list_jobs` and return an empty array (or seeded projects if any exist).

> **Mac Claude Desktop is the only working prod client today.** The in-app "Add custom connector" UI on Claude Desktop and Claude.ai (web + iOS + Android) is OAuth-only — no bearer-token field, only OAuth Client ID + Secret. The server currently accepts only static bearer auth, so those flows fail. Adding OAuth (likely Cloudflare Workers OAuth Provider) is tracked in [backlog.md §Runtime / MCP](../product/backlog.md). Until OAuth lands, mobile + web are blocked. Local dev (`gc-erp-local`) is also Mac-Desktop-only; `localhost` doesn't resolve from mobile regardless.

## First-time local setup

```bash
bun install                         # resolve workspaces
direnv allow                        # load .envrc.enc → MCP_BEARER_TOKEN + CF creds
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
3. `bun run deploy` — deploy the Worker (no permission prompt when run from your shell; agent-config policy only intercepts when Claude invokes it)
4. Verify the seed:
   ```bash
   bun run db:query:prod "SELECT count(*) FROM activities"
   ```
   Expect a count of `22` (the starter library).
5. Smoke-test end-to-end:
   ```bash
   bun run scenario kitchen --target prod
   ```
   The new prod-confirm prompt prints a plan; type `y`. Expect `✓ scenario completed`.

   This is the load-bearing smoke-test — it exercises the full Day-0 walkthrough (`create_party` → `create_project` → `create_job` → `create_scope` → `apply_patch` → `issue_ntp` → `get_scope_tree`) against live D1 over the real MCP HTTP transport.

   On failure: tail the Worker with `bunx wrangler tail gc-erp-mcp-server --remote` from `packages/mcp-server/` and re-run.

> **Why not a one-shot `curl`?** The streaming HTTP transport is stateful — `tools/list` requires an `Mcp-Session-Id` header obtained from a prior `initialize` handshake. A single `curl tools/list` returns HTTP 400 with `Mcp-Session-Id header is required`, which looks like a bug but isn't. If you need a curl-level check, do it as two requests: POST `initialize` (capture `Mcp-Session-Id` from the response headers), then POST `tools/list` carrying that header. The scenario runner does this for you.

## Rollback

If a prod deploy fails or reveals a hot bug post-deploy:

```bash
wrangler rollback --name gc-erp-mcp-server
```

This reverts the Worker binary to the previous version. **Migrations stay applied** — they're additive and backwards-compatible, so rollback + migrations-applied is a valid stable state. Before running, flag it in chat — there's no one-click undo beyond `git reflog`.

The previous known-good Worker version is `a9d2268d` (M1 deploy, 2026-04-17).
