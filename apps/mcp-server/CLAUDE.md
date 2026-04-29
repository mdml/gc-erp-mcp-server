# CLAUDE.md — apps/mcp-server

The Cloudflare Worker. **This is the one and only thing that ships to production.** Every dep added here grows the deployed bundle; every line changed here affects live behavior for Max + Salman.

## What's here

| File | Role |
|---|---|
| `src/index.ts` | Worker fetch handler + `GcErpMcp` McpAgent subclass + bearer auth |
| `src/*.test.ts` | Vitest suites (coverage-enforced) |
| `wrangler.jsonc` | Worker config — compatibility date, DO binding, migrations, local-dev `vars` (`MCP_BEARER_TOKEN: "dev"`) |
| `vitest.config.ts` | Coverage thresholds + exclusions |

## Runtime model

See [docs/guides/ARCHITECTURE.md §3](../../docs/guides/ARCHITECTURE.md) for the full request lifecycle. Short version:

1. Fetch hits the Worker.
2. `GET /` → plaintext banner (no auth).
3. `GET /.well-known/oauth-authorization-server` → Clerk's FAPI discovery doc, proxied (prod only, no auth).
4. `GET /.well-known/oauth-protected-resource` → Clerk-shaped protected-resource metadata; referenced from the `/mcp` 401's `www-authenticate` header (prod only, no auth).
5. `POST /mcp*` → **prod:** `authenticateRequest({ acceptsToken: "oauth_token" })` from `@clerk/backend` validates the Clerk-issued JWT against Clerk's JWKS; **local:** constant-time bearer compare via `timingSafeEqual`. Selector is `env.CLERK_SECRET_KEY` presence (prod sets it, local doesn't). Then delegate to `GcErpMcp.serve("/mcp")`. Note there is NO local `/authorize` route — Clerk's FAPI is the authorization endpoint directly, per ADR 0012's hosted-consent model. Any `/authorize` hitting our Worker is a misrouted client and 404s.
6. `McpAgent` spawns/resolves a Durable Object per MCP session.
7. Tool handlers registered in `GcErpMcp.init()` run inside the DO. In prod they can read the authenticated user's `userId` / `scopes` / `clientId` via `getMcpAuthContext().auth` from `agents/mcp`.
8. Streamable HTTP returns JSON-RPC (and any SSE frames) to the client.

## Invariants

- **Every `/mcp*` request must be authenticated** before it reaches `GcErpMcp.serve()`. In prod that means a valid Clerk-issued OAuth JWT; in local that means the static bearer. Never add a code path that skips the check. If you add a new public endpoint, keep it outside the `/mcp` prefix (e.g. a health probe at `/health`) so the routing is unambiguous. See [ADR 0012](../../docs/decisions/0012-clerk-for-prod-mcp-oauth.md) for the prod-vs-local split.
- **Auth-mode selector is `env.CLERK_SECRET_KEY`.** Presence → prod (Clerk JWT). Absence → local (static bearer). Do not introduce other selectors (hostname checks, `NODE_ENV`, etc.) — they drift from the secret-configuration that actually determines which path works. `CLERK_PUBLISHABLE_KEY` flows alongside but is not the selector; it's required for prod-mode to engage, though — a half-rotated config (one key set, not both) falls back to local mode defensively rather than crashing inside `deriveFapiUrl`, so the "absence → local" guarantee still holds.
- **Constant-time token compare (local-mode only).** The local-bearer path uses a hand-rolled `timingSafeEqual`. Don't replace it with `===`; a timing oracle on an auth token is a real attack. Clerk's JWT validation handles its own timing-safety; don't reimplement it.
- **No `/authorize` route.** With Clerk's hosted consent, the discovery doc points claude.ai directly at Clerk's FAPI for authorization. Reintroducing a local `/authorize` handler is a Stytch-era Path-A artifact — don't. See ADR 0012 for why.
- **No wrangler secrets in code.** `MCP_BEARER_TOKEN` (local — public literal `"dev"`), `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (prod) are read from `env.*`. The local bearer comes from `wrangler.jsonc` `vars` (committed; it's a public literal — see ADR 0015). Prod secrets come from `wrangler secret put`. Real per-developer secrets (`CLOUDFLARE_*`, `CLERK_*` for rotation, `CS_ACCESS_TOKEN`, `GH_TOKEN`) live in `.env.local` and reach commands via `bunx dotenvx run -f .env.local --`. Never inline a secret in source, never log.
- **Durable Object class is `GcErpMcp`.** The `MCP_OBJECT` binding in `wrangler.jsonc` points at this class, and migration `v1` creates it as a SQLite-backed DO. If you rename the class or remove it, that's a migration boundary — add a new `migrations` entry, don't edit `v1`.
- **The DO's SQLite is for MCP-session runtime only** (transport buffers, session identity, subscriptions, hibernatable connections — owned by `agents/McpAgent`). Domain state — jobs, commitments, costs, patches, document metadata — lives in D1; document blobs in R2. Per [ADR 0003](../../docs/decisions/0003-storage-split.md). Adding a table to DO SQLite for domain use is a design bug.
- **Compatibility date is pinned.** Changes to `wrangler.jsonc` `compatibility_date` are deliberate. Worker APIs evolve; advancing the date is an intentional upgrade, not a bump-for-bumping.
- **Multi-table writes go through D1 batched statements.** Any tool that mutates more than one D1 row per call (`apply_patch` being the canonical example) must assemble all statements into a single `db.batch([...])` call so the whole patch is one atomic transaction. Hand-rolled multi-statement writes are a correctness bug — partial projection state breaks the "current state = fold(patches)" audit invariant. See [ADR 0008](../../docs/decisions/0008-apply-patch-atomicity-via-d1-batch.md).

## Testing

- Test the **pure parts** of the fetch handler directly (auth check, routing decisions). Spin up a `new Request(...)`, call `fetch(req, mockEnv, mockCtx)`, assert on the `Response`.
- **Do not try to spin up a Durable Object in vitest.** The DO runtime is `workerd`-only; tests that cover tool dispatch belong in integration tests against `wrangler dev` or (eventually) Miniflare. For v1 it's fine to leave tool behavior uncovered — the handlers are trivial (`ping` returns time, `list_jobs` returns `[]`). As real tools land, prefer extracting the tool's logic into a pure function that's testable without the DO, and have `init()` wire the pure function into the MCP server.
- **Don't mock `agents/McpAgent`.** If a test would require mocking it, either rewrite the test against pure logic or move the assertion to an integration layer.

## Deploy

- `bunx dotenvx run -f .env.local -- turbo run deploy` (or wrap `bun run deploy` similarly) — `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are injected into wrangler's process env from your encrypted `.env.local` (per ADR 0015). The dotenvx wrapper replaces direnv; the parent shell never holds these values.
- Prod OAuth secrets (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) are uploaded separately via `wrangler secret put …` — a conscious one-time act per rotation, not automated. Wrap that in `bunx dotenvx run -f .env.local -- …` too. No `MCP_BEARER_TOKEN` in prod Cloudflare secrets; the local-bearer path is gated on `env.CLERK_SECRET_KEY` absence and only runs under `wrangler dev`.

## Don't add

- **Node-only deps without `nodejs_compat` verification.** The Worker runtime is V8, not Node. If a dep uses `fs`, `net`, `crypto` (Node's), it won't run. Check the `nodejs_compat` flag and polyfill coverage before adding.
- **Top-level state.** Workers are stateless between invocations (unless in a DO). If you're tempted to cache something at module scope, it probably belongs in the DO.
- **Dev-only deps.** If a package is only used by tests or tooling, it belongs in `devDependencies` here or — better — in `packages/dev-tools`.
