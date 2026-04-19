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

No `db:seed:kitchen:prod` — the kitchen fixture is synthetic test data, not real-work data.

### Database — ad-hoc queries

```
bun run db:query:local "SELECT count(*) FROM activities"
bun run db:query:prod  "SELECT count(*) FROM activities"
```

`db:query:prod` warns and requires confirmation before executing any query containing `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, or `ALTER`. Pass `--yes` to skip the prompt in scripted contexts.

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

**Desktop config is stdio-only.** Per the [official MCP docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers), the config file supports only `command` + `args` entries — there is no native `type: "http"`. Remote HTTP MCP servers reach Desktop via the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) npx bridge, which speaks stdio to Desktop and HTTP to the server. (Pro/Teams/Enterprise accounts can alternatively add remote MCP servers via the in-app **Settings → Connectors** UI; that path bypasses the config file entirely and is the right choice for prod on mobile/web — see [§Claude.ai Connectors](#claudeai-connectors-mobile--web).)

### `install:mcp:local` — writes the config

```
bun run install:mcp:local            # write gc-erp-local entry (backs up existing config first)
bun run install:mcp:local --remove   # remove gc-erp-local entry
```

The script:
1. Reads the existing config (or creates `{}` if none exists).
2. Backs it up to `claude_desktop_config.json.<timestamp>.bak`.
3. Resolves an absolute path to Homebrew's `npx` (`/opt/homebrew/bin/npx` on Apple Silicon, `/usr/local/bin/npx` on Intel). Fails with a `brew install node` hint if neither exists. See [Node version caveat](#node-version-caveat) for why.
4. Patches in (or removes) the `gc-erp-local` entry. Other servers (e.g. `filesystem`) and top-level keys (e.g. `preferences`) are preserved untouched.
5. Atomically writes the updated file.
6. Prints "Restart Claude Desktop to apply changes."

The entry it writes:

```json
{
  "mcpServers": {
    "gc-erp-local": {
      "command": "/absolute/path/to/npx",
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

Why the `${AUTH_HEADER}` indirection: `mcp-remote` parses `--header` values verbatim, and a bare `"Bearer dev"` with a space confuses its argv parsing on some Desktop versions. Wrapping the token in an env var — passed through `env` — sidesteps the issue.

The token `dev` is the fixed local value from `.dev.vars`. It is not a secret — nothing in local D1 warrants protection.

#### Node version caveat

Claude Desktop on macOS launches from Finder/Launcher and inherits the **macOS launch-services PATH**, not your shell PATH. If you use nvm, Desktop may resolve a bare `npx` to whichever Node version appears first in that inherited PATH — often an ancient install (e.g. Node 16). `mcp-remote`'s transitive dep `wsl-utils` uses modern `node:fs/promises` exports that only exist in Node ≥18, so a stale Node resolution surfaces as:

```
SyntaxError: The requested module 'node:fs/promises' does not provide an export named 'constants'
```

**Why Homebrew, not nvm:** Homebrew installs `node` at a stable absolute path (`/opt/homebrew/bin/npx` on Apple Silicon) that doesn't move when you upgrade Node — `brew upgrade node` retargets the symlink. nvm's per-version paths (`~/.nvm/versions/node/v22.21.1/bin/npx`) require re-running `install:mcp:local` after every `nvm install`, and the macOS launch PATH tends to surface the lexicographically-first nvm version rather than the active one. If you only need a single recent Node (and most modern stacks, including this repo's bun-first setup, do), Homebrew is simpler. Run `brew install node` once and `install:mcp:local` will find it.

### `install:mcp:prod` — prints the config block

Prod credentials should not be written to a local file by a script. Instead, print the block:

```
bun run install:mcp:prod
```

Output (stdio-bridge form, works in `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gc-erp-prod": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://gc.leiserson.me/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer <your MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

Paste this into `claude_desktop_config.json` alongside the `gc-erp-local` entry and substitute your `$MCP_BEARER_TOKEN`. The token value is redacted in the printed output — the script uses `$MCP_BEARER_TOKEN` which is already in your environment; copy it in manually.

**Recommended for prod: use the in-app Connectors UI instead.** Because `gc.leiserson.me` is a public HTTPS URL, you can skip the config file entirely: **Settings → Connectors → Add custom connector** in Claude Desktop. Desktop speaks HTTP directly to the URL — no `mcp-remote`, no Node, no PATH gymnastics. Available on all plans (Free is limited to one custom connector). The Connectors UI is the *only* path that works on Claude.ai web/mobile (see [§Claude.ai Connectors](#claudeai-connectors-mobile--web)) since those clients can't run local stdio bridges. **The config-file form above remains the only option for `gc-erp-local`** — Connectors UI requires connections to originate from Anthropic's servers, which can't reach your localhost.

After editing, restart Claude Desktop. Smoke-test in a conversation: "list my jobs" → should call `list_jobs` and return an empty array (or seeded projects if any exist).

## Claude.ai Connectors (mobile / web)

Claude iOS and Android support remote MCP connectors. In-app: **Settings → Connectors → Add custom connector**.

- **URL:** `https://gc.leiserson.me/mcp`
- **Bearer token:** your `MCP_BEARER_TOKEN` from 1Password `gc-erp` vault

Local dev is not useful from mobile (localhost doesn't resolve on mobile networks). Prod-only on mobile is the right setup.

The web interface at claude.ai supports the same connector configuration under Profile → Connectors.

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
3. `bun run deploy` — deploy the Worker (denied by default; expect a permission prompt)
4. Smoke-test:
   ```bash
   curl -X POST https://gc.leiserson.me/mcp \
     -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```
   Expect: HTTP 200 with a `tools` array including `apply_patch`, `issue_ntp`, `get_scope_tree`.

   HTTP 401 → bearer mismatch. HTTP 500 → runtime error; tail `wrangler tail gc-erp-mcp-server --remote`.

5. Optional: `bun run scenario kitchen --target prod` — full Day-0 walkthrough against live infra.

## Rollback

If a prod deploy fails or reveals a hot bug post-deploy:

```bash
wrangler rollback --name gc-erp-mcp-server
```

This reverts the Worker binary to the previous version. **Migrations stay applied** — they're additive and backwards-compatible, so rollback + migrations-applied is a valid stable state. Before running, flag it in chat — there's no one-click undo beyond `git reflog`.

The previous known-good Worker version is `a9d2268d` (M1 deploy, 2026-04-17).
