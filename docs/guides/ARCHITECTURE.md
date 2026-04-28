# Architecture

How the gc-erp-mcp-server is built: repo layout, runtime, deploy, secrets, gates.

For what the system *represents* — data model, job walkthrough, open questions — read [SPEC.md](../../SPEC.md). For the project's scope and motivation read [docs/product/overview.md](../product/overview.md). This file is about the *machine*.

> **Status:** reflects state after sessions 1–3 (turbo scaffold → quality gates → code-health + coverage). v1 runtime surface is heartbeat-only (`ping`, `list_jobs`); real tools land with the data model in later milestones.

---

## 1. One-screen summary

```
┌──────────────────┐        HTTPS + streamable HTTP          ┌────────────────────────────┐
│   MCP client     │  ─────────────────────────────────▶     │  Cloudflare Workers edge   │
│ (Claude Desktop, │  Authorization: Bearer <jwt|token>      │                            │
│  Claude web,     │                                         │  ┌──────────────────────┐  │
│  Claude mobile)  │  ◀─────────────────────────────────     │  │  fetch handler       │  │
└──────────────────┘            JSON-RPC responses           │  │  - prod: validate    │  │
         │                                                   │  │    Clerk JWT         │  │
         │ OAuth 2.1 + DCR                                   │  │  - local: static     │  │
         │ (prod only)                                       │  │    bearer compare    │  │
         ▼                                                   │  │  - serve /.well-known│  │
┌──────────────────┐                                         │  │    (auth-server +    │  │
│  Clerk           │  ◀─ /register, /authorize, /token ─     │  │     prot-resource)   │  │
│  (OAuth AS +     │   + hosted consent page                 │  │  - route /mcp → DO   │  │
│   hosted consent)│                                         │  └──────────┬───────────┘  │
└──────────────────┘                                         │             │              │
                                                             │  ┌──────────────────────┐  │
                                                             │  │ GcErpMcp Durable     │  │
                                                             │  │ Object (per session) │  │
                                                             │  │  - McpAgent runtime  │  │
                                                             │  │  - McpServer +       │  │
                                                             │  │    tool dispatch     │  │
                                                             │  │  - SQLite storage*   │  │
                                                             │  └──────────────────────┘  │
                                                             └────────────────────────────┘
                                                              * MCP-session runtime only; domain state in D1 (ADR 0003)
```

- **Product:** the MCP server itself. Distribution is a hosted URL plus an OAuth flow (prod) or a static bearer token (local).
- **Transport:** streamable HTTP, per the MCP spec. Stdio is out of scope — the server has to be reachable from phones.
- **Session model:** Cloudflare `agents/McpAgent` backs each MCP session with its own Durable Object instance. The DO holds MCP-session runtime state only (transport, subscriptions, auth props from the OAuth flow). Domain state — jobs, commitments, costs, documents — lives in D1 and R2. See [ADR 0003](../decisions/0003-storage-split.md).
- **Auth (prod):** Clerk is the OAuth 2.1 AS and hosts the consent page end-to-end. The Worker exposes `/.well-known/oauth-authorization-server` (proxied from Clerk's FAPI discovery doc) and `/.well-known/oauth-protected-resource` (Clerk-shaped metadata referenced from the `/mcp` 401's `www-authenticate`). `/mcp*` validates the Clerk-issued JWT via `@clerk/backend`'s `authenticateRequest({ acceptsToken: "oauth_token" })` and exposes `userId` / `scopes` / `clientId` to tool handlers via `getMcpAuthContext().auth`. No local `/authorize` route — clients go directly to Clerk's FAPI per the discovery doc. See [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md).
- **Auth (local):** static bearer (`MCP_BEARER_TOKEN=dev` in `.dev.vars`). Gated on `env.CLERK_SECRET_KEY` absence — prod sets it, local doesn't. Keeps the scenario runner simple; local D1 holds no real data.

---

## 2. Repo layout

Turbo-managed bun workspace. One app + four libraries at v1:

```
.
├── SPEC.md                          # data model + job walkthrough + open questions
├── README.md                        # onboarding + deploy
├── CLAUDE.md                        # root agent instructions
├── docs/
│   ├── CLAUDE.md                    # docs landscape (what lives where)
│   ├── guides/
│   │   ├── ARCHITECTURE.md          # ← you are here
│   │   └── CLAUDE.md
│   ├── product/                     # goal, scope, milestones, backlog
│   ├── decisions/                   # architecture decision records (template + seeded)
│   └── retros/                      # draft.md queue + dated retros (Max-initiated)
├── biome.json                       # lint + format (single tool)
├── bunfig.toml                      # exact versions, text lockfile, 7-day release age
├── commitlint.config.ts             # conventional commits (standard types only)
├── lefthook.yml                     # git hooks: pre-commit, commit-msg, pre-push
├── osv-scanner.toml                 # vuln scan config
├── turbo.json                       # task graph (dev, deploy, lint, typecheck, test, ...)
├── .envrc                           # direnv shim — auto-decrypts .envrc.enc with age
├── .envrc.enc                       # gitignored, per-developer, age-encrypted dotenv
├── .mcp.json                        # MCP servers for Claude Code (context7, codescene)
├── .github/                         # CI (TBD)
├── apps/                            # user-facing shipping units (ADR 0013)
│   └── mcp-server/                  # the Cloudflare Worker — the runtime; ships to production
│       ├── src/index.ts             #   fetch handler + GcErpMcp class + timingSafeEqual
│       ├── src/*.test.ts            #   vitest suites
│       ├── vitest.config.ts         #   coverage thresholds: 90 overall / 70 per file
│       ├── wrangler.jsonc           #   Worker + DO binding + migration
│       └── .dev.vars.example
└── packages/                        # internal libraries consumed by apps/* (ADR 0013)
    ├── database/                    # data layer — SPEC.md §1 port; imported by mcp-server
    │   ├── src/schema/              #   drizzle tables + Zod domain types (runtime)
    │   ├── src/ids/                 #   `{prefix}_{nanoid21}` generators (runtime)
    │   ├── src/invariants/          #   pure validators for constraints SQL can't express
    │   ├── src/patches/hash.ts      #   content-addressed pat_<sha256> (runtime)
    │   ├── src/client.ts            #   typed drizzle-D1 client factory (runtime)
    │   ├── src/migrations/          #   drizzle-kit output SQL (tooling — applied by wrangler)
    │   └── src/seed/                #   activity-library seeder + data (tooling)
    ├── dev-tools/                   # internal CLIs for LOCAL dev — never bundled into the runtime
    │   ├── src/sync-secrets.ts      #   1Password → age → .envrc.enc + .dev.vars
    │   ├── src/secrets.config.ts    #   declarative list of required secrets
    │   ├── src/gate/                #   gate runner (typecheck, lint, test, code health)
    │   └── src/*.test.ts
    ├── infra/                       # internal CLI for REMOTE Cloudflare state — never bundled
    │   ├── src/infra.config.ts      #   declarative desired state (worker, custom domain, …)
    │   ├── src/lib/                 #   sole boundary: cloudflare-client (fetch), wrangler-adapter (Bun.spawn)
    │   ├── src/providers/           #   one file per resource kind (custom-domain, d1, r2; secrets next)
    │   └── src/{status,apply,teardown}.ts  # command entries (bun run infra:status etc.)
    └── agent-config/                # single source of truth for Claude Code permissions
        └── src/policy/              #   allow/deny/mcp policy; installs .claude/settings.json via bun install
```

**Why the `apps/` vs `packages/` split.** Per [ADR 0013](../decisions/0013-apps-layout-convention.md): `apps/*` holds user-facing shipping units (the Worker plus future UI bundles like `apps/cost-entry-form/` in M3); `packages/*` holds internal libraries consumed only by other workspaces. The classification axis is "does a human ever see this (directly or via the Worker)?" — not "does it deploy standalone?" Keeps UI bundles and the Worker in the same bucket even though only the Worker runs `wrangler deploy`.

---

## 3. Runtime — request lifecycle

A single HTTP request from a client:

1. **Edge entry.** Cloudflare routes the request to our Worker at `https://gc.leiserson.me` (attached via the `custom_domain: true` route in `wrangler.jsonc`; the `*.workers.dev` fallback is disabled).
2. **Fetch handler** (`apps/mcp-server/src/index.ts` → `apps/mcp-server/src/handler.ts`):
   - `GET /` → plaintext banner, 200. Used as a trivial liveness check; no auth.
   - `GET /.well-known/oauth-authorization-server` → proxied verbatim from Clerk's FAPI discovery doc (`{fapi}/.well-known/oauth-authorization-server`). Prod only (local returns 404; local uses the bearer path).
   - `GET /.well-known/oauth-protected-resource` → Clerk-shaped protected-resource metadata; referenced from the `/mcp` 401's `www-authenticate` header. Prod only.
   - `POST /mcp*`:
     - **Prod** (`env.CLERK_SECRET_KEY` set) — validate the incoming Clerk-issued OAuth JWT via `@clerk/backend`'s `authenticateRequest({ acceptsToken: "oauth_token" })`; on success, attach `{ auth: { userId, scopes, clientId } }` to the execution context's `props`; on failure return `401` with `WWW-Authenticate: Bearer resource_metadata_uri=".well-known/oauth-protected-resource"`.
     - **Local** (no `CLERK_SECRET_KEY`) — constant-time compare `Authorization: Bearer $MCP_BEARER_TOKEN` via `timingSafeEqual`; `401` on mismatch.
   - Other paths → `404 not found`. Note: no `/authorize` route — the discovery doc points claude.ai directly at Clerk's FAPI for authorization, per ADR 0012's hosted-consent model.
3. **MCP delegation.** Authenticated `/mcp*` requests are handed to `GcErpMcp.serve("/mcp")`, Cloudflare's `agents/McpAgent` runtime. Tool handlers read the authenticated user's identity via `getMcpAuthContext().auth` from `agents/mcp` (shape: `{ userId, scopes, clientId }`).
4. **Durable Object per session.** `McpAgent` resolves (or spawns) a Durable Object instance keyed by the MCP session ID. One session, one DO. This is where MCP server state (tool list, subscriptions, in-flight requests) lives for the life of the connection.
5. **MCP server dispatch.** Inside the DO, a `McpServer` (from `@modelcontextprotocol/sdk`) receives the JSON-RPC message and dispatches to tool handlers registered in `GcErpMcp.init()`. At v1: `ping` and `list_jobs`.
6. **Response.** Streamable HTTP carries the JSON-RPC response (and any SSE frames for streaming tools) back to the client.

**Stateless for now; D1-stateful later.** v1's tools don't touch any storage — `ping` returns wall clock, `list_jobs` returns `[]`. When the data model lands, commitments/costs/events will live in D1 (domain state) and document blobs in R2 (content-addressed by sha256). The DO's SQLite stays reserved for MCP-session-runtime bookkeeping that `agents/McpAgent` owns. See [ADR 0003](../decisions/0003-storage-split.md) for the reasoning.

---

## 4. Secrets architecture

Three layers, each with a different lifecycle and a different failure mode.

```
                      1Password (gc-erp vault)
                    [source of truth for all secrets]
                                    │
                                    │ op read (on demand)
                                    ▼
                 packages/dev-tools/src/sync-secrets.ts
                                    │
              ┌─────────────────────┴──────────────────────┐
              ▼                                            ▼
     .envrc.enc                              apps/mcp-server/.dev.vars
   (age-encrypted                            (plaintext, gitignored)
    to your pubkey,                                 │
    gitignored)                                     │
         │                                          ▼
         │ direnv + age -d                   read by `wrangler dev`
         ▼                                   into the local Worker
  shell env exports:                              (local dev only)
  - CLOUDFLARE_API_TOKEN                          MCP_BEARER_TOKEN=dev
  - CLOUDFLARE_ACCOUNT_ID                         (no CLERK_* — prod only)
  - MCP_BEARER_TOKEN
  - CLERK_SECRET_KEY       (prod use)
  - CLERK_PUBLISHABLE_KEY  (prod use)
         │
         ▼
    wrangler deploy
    (reads env, no user-wide
     `wrangler login` token)


                     [Cloudflare secrets — separate, one-time upload]
                                          │
                                          ▼
                          wrangler secret put CLERK_SECRET_KEY
                          wrangler secret put CLERK_PUBLISHABLE_KEY
                             (encrypted at rest on Cloudflare;
                              available to deployed Worker as env.*)

                          MCP_BEARER_TOKEN is NOT uploaded to prod —
                          prod uses Clerk JWT validation instead (ADR 0012).
```

**Why this shape.**

- **1Password is the source of truth.** Both developers have access to the shared vault; rotation is a single edit in 1Password followed by `turbo run sync-secrets` on each machine.
- **Age encryption is local-only.** `.envrc.enc` is encrypted to the developer's *own* pubkey (read from `~/.config/sops/age/keys.txt`). No multi-recipient complexity, no key server, no network. Each developer regenerates their own `.envrc.enc` from 1Password.
- **direnv auto-loads on `cd`.** No `source .env` ritual; every shell at the repo root has the right env.
- **`wrangler login` is deliberately avoided.** It writes a user-wide OAuth token at `~/.wrangler/config/default.toml` that would then be picked up by every Cloudflare-touching repo on the machine. Max works in multiple GitHub orgs — per-project env-var auth keeps projects isolated.
- **`.dev.vars` is separate from the shell env.** Wrangler reads `.dev.vars` into the *Worker's* runtime environment during `wrangler dev`; those bindings don't touch the shell. `sync-secrets` writes both artifacts from the same 1Password lookup.
- **Prod uses Clerk OAuth, not a bearer (per [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)).** `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` are uploaded via `wrangler secret put` — one-time per rotation, deliberately manual. The old `MCP_BEARER_TOKEN` prod upload is retired; claude.ai Custom Connectors reject bearer headers in favor of OAuth 2.1 + DCR, and Clerk is the OAuth AS (with hosted consent — see ADR 0012 for why that matters vs. the superseded Stytch plan). `MCP_BEARER_TOKEN=dev` stays in local `.dev.vars` for `wrangler dev` and the scenario runner (local D1 holds no real data).
- **Turbo 2.x scrubs env by default.** The `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `OP_SERVICE_ACCOUNT_TOKEN` / `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` variables above only reach their child processes because they're declared in `turbo.json`'s `globalPassThroughEnv`. `globalPassThroughEnv` (not `globalEnv`) is the right primitive for secrets — the values don't get hashed into the task cache key. Without the declaration, wrangler sees no auth and silently falls back to OAuth — a class of bug the env-var auth pattern is meant to prevent, so the passthrough list is part of the secrets architecture, not a build-system detail.

**`CLOUDFLARE_API_TOKEN` permission groups.** The token in 1Password needs the groups listed below. A missing group presents as a 401/403 from the specific endpoint that needs it — the symptom is service-specific (e.g. R2 works but D1 fails), *not* a blanket auth failure. Watch for that pattern when a new provider lands.

| Group | Scope | Why |
|---|---|---|
| `Account → Workers Scripts:Edit` | Account | `wrangler deploy` — upload the Worker, apply DO migrations |
| `Account → D1:Edit` | Account | [`packages/infra`](../../packages/infra/) D1 provider (list/create/delete databases) |
| `Account → Workers R2 Storage:Edit` | Account | [`packages/infra`](../../packages/infra/) R2 provider (list/create/delete buckets) |
| `Zone → Workers Routes:Edit` | Zone: `leiserson.me` | `custom_domain: true` route attach via wrangler |

When new providers land, the token needs a matching group added. [`packages/infra/src/providers/`](../../packages/infra/src/providers/) is the authoritative list of what endpoints we hit — if a provider's `cf()` call returns Authentication error, the failing endpoint tells you which group is missing.

Files on disk, at rest:

| Path                                    | Secret? | Git? | Purpose                                    |
|-----------------------------------------|---------|------|--------------------------------------------|
| `.envrc`                                | No      | Yes  | direnv shim — decryption logic only        |
| `.envrc.enc`                            | Yes     | No   | age-encrypted dotenv (per-developer)       |
| `apps/mcp-server/.dev.vars`         | Yes     | No   | wrangler dev local env (`MCP_BEARER_TOKEN=dev`; no `CLERK_*` — OAuth is prod-only) |
| `apps/mcp-server/.dev.vars.example` | No      | Yes  | template                                   |
| `packages/dev-tools/src/secrets.config.ts` | No   | Yes  | declarative list of secrets + op refs      |
| 1Password `gc-erp`                      | Yes     | —    | source of truth — holds `MCP_BEARER_TOKEN` (local-dev convenience) + `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (prod-only) + Cloudflare creds |
| Cloudflare secret storage               | Yes     | —    | production runtime env — `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY`; no `MCP_BEARER_TOKEN` in prod |

---

## 5. Deployment

```
developer shell (env vars loaded via direnv)
       │
       │  turbo run deploy   ← globalPassThroughEnv forwards the auth vars
       ▼
wrangler → reads wrangler.jsonc (account_id pin refuses non-matching CLOUDFLARE_ACCOUNT_ID)
           uploads Worker script (src/index.ts, compiled)
           applies DO migrations (GcErpMcp SQLite class)
           attaches custom domain  gc.leiserson.me  (routes custom_domain:true)
```

- **One environment.** v1 has no staging. The canonical URL is `https://gc.leiserson.me`; `*.workers.dev` and preview URLs are explicitly disabled in `wrangler.jsonc` (`workers_dev: false`, `preview_urls: false`) so the auth surface is a single hostname. A rotation of `MCP_BEARER_TOKEN` + re-upload is enough to revoke access if the bearer leaks.
- **Account pin.** `apps/mcp-server/wrangler.jsonc` declares `account_id` for the personal Cloudflare org that owns `leiserson.me`. Wrangler refuses to deploy if `CLOUDFLARE_ACCOUNT_ID` disagrees, turning cross-account mis-routes (e.g. a stale value in 1Password pointing at a different org) into a loud failure instead of a silent wrong-account deploy.
- **Durable Object migrations** are declared in `wrangler.jsonc` under `migrations`. Each migration gets a tag (`v1`, `v2`, …). Adding SQL state later is a new migration, not a rewrite.
- **Compatibility date** is pinned (`2026-04-15` at v1). Worker APIs evolve; pinning ensures old deploys don't start behaving differently after a platform update.
- **Account-level provisioning** (custom domain, D1, and R2 — status, apply, teardown; Worker secrets follow) lives in [`packages/infra/`](../../packages/infra/) as a declarative manifest + per-command entry scripts — `bun run infra:{status,apply,teardown}`. `wrangler deploy` stays in charge of the Worker script, DO migrations, and the custom-domain *attach*; the infra CLI handles status, teardown, and the resources around the Worker that wrangler doesn't manage. See [ADR 0002](../decisions/0002-infra-cli.md).

---

## 6. Quality gates

What runs when and why, top to bottom:

### pre-commit (local, fast)

| Check          | Mechanism                     | Purpose                                         |
|----------------|-------------------------------|-------------------------------------------------|
| lint           | `turbo run lint` (biome)      | catch style + common bugs                       |
| typecheck      | `turbo run typecheck` (tsc)   | catch type regressions                          |
| code-health    | `cs check` on staged files    | reject files with CodeScene health score < 10  |

Lint + typecheck run in parallel. Code-health skips with a visible warning if `cs` CLI isn't installed — we do not want to block contributors who haven't set up CodeScene, but the signal being off must be loud.

### commit-msg

| Check       | Mechanism                              | Purpose                                        |
|-------------|----------------------------------------|------------------------------------------------|
| commitlint  | `bunx commitlint --edit {1}`           | enforce Conventional Commits (standard types)  |

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. No project-specific extensions.

### pre-push (local, thorough)

| Check           | Mechanism                                                   | Purpose                                         |
|-----------------|-------------------------------------------------------------|-------------------------------------------------|
| full gate       | `bun run gate -- --coverage`                                | typecheck + lint + test w/ coverage + cs        |
| vulnerability   | `osv-scanner scan --config ... --lockfile=bun.lock`         | catch known CVEs in dependencies                |

`bun run gate` dispatches to `packages/dev-tools/src/gate/` which runs each check as a subprocess, collects results, and prints a pass/fail summary. Coverage thresholds are `lines: 90` overall / `lines: 70` per file, configured in each package's `vitest.config.ts`.

### CI (GitHub Actions)

| Check       | Mechanism                              | Purpose                                        |
|-------------|----------------------------------------|------------------------------------------------|
| lint        | `bun run lint`                         | server-side repeat of the pre-commit gate      |
| typecheck   | `bun run typecheck`                    | server-side repeat of the pre-commit gate      |
| tests + cov | `bun run test:coverage`                | enforce thresholds on PRs and main             |

Defined in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). CodeScene and OSV intentionally stay local-only: CodeScene needs `CS_ACCESS_TOKEN` (no secret management for dogfood), and both are already enforced on pre-push.

### Why this ladder

Fast local checks fail loudly at the moment of authorship. Expensive checks move to pre-push so that each commit stays cheap. CI is the backstop — it reruns the same free checks (lint + typecheck + tests w/ coverage) server-side so a broken branch can't reach `main` if someone bypasses hooks. Secret-gated checks (CodeScene, OSV) stay local.

---

## 7. Toolchain — one line each

| Tool                | Role                   | Why                                                                          |
|---------------------|------------------------|------------------------------------------------------------------------------|
| **Bun**             | runtime + package mgr  | fast installs, native TS, one binary for test/format/run                     |
| **Turbo**           | task graph + cache     | zero-config incremental across packages, caches test/lint results            |
| **Wrangler**        | Cloudflare CLI         | the only way to ship to Workers                                              |
| **agents/McpAgent** | MCP server runtime     | handles streamable HTTP transport + session-scoped DOs; built on MCP TS SDK  |
| **Zod v4**          | schema validation      | required by `agents@0.11`; holds SPEC.md types in `packages/database/src/schema/` |
| **Drizzle ORM**     | D1 schema + queries    | one source of truth — drizzle-kit generates migrations, Worker runs typed queries, seeds share the same schema |
| **nanoid**          | ID generation          | 21-char URL-safe suffix behind entity prefix (`job_`, `scope_`, …); content-addressed `doc_<sha256>` / `pat_<sha256>` are separate |
| **Biome**           | lint + format          | one tool instead of eslint + prettier; fast                                  |
| **Vitest**          | tests + coverage       | bun-compatible; v8 coverage provider for line thresholds                     |
| **Commitlint**      | commit-msg enforcement | conventional commits discipline                                              |
| **Lefthook**        | git hook manager       | fast, parallel, self-installs via `prepare` script                           |
| **OSV-Scanner**     | supply-chain scan      | checks bun.lock against Google's OSV database on every push                  |
| **CodeScene `cs`**  | code-health gate       | per-file score ≥ 10 requirement catches complexity regressions at authoring time |
| **age**             | local encryption       | no network, no key server; encrypt `.envrc.enc` to own pubkey                |
| **direnv**          | shell env per-dir      | auto-load on `cd` removes the "did I source .env?" failure mode              |
| **1Password CLI**   | secret retrieval       | `op read` feeds `sync-secrets`; shared vault is team source of truth         |

---

## 8. What's deferred

Pointers into the roadmap — things the architecture has slots for but doesn't yet use.

- **Tools surface** — SPEC.md §1 Zod types are ported in `packages/database` (M1). Tool handlers that consume them live in `apps/mcp-server/src/tools/` per the `McpToolDef` + `createTestDb()` pattern (layer 1 of [ADR 0004](../decisions/0004-acceptance-testing-strategy.md)). Shipped through M2-so-far: `create_project`, `create_job`, `create_scope`, `update_scope`, `list_jobs`, `list_scopes`, `ensure_activity`, `create_party`, `apply_patch` (D1-batched projection per [ADR 0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md); voidedness projected on `commitments` per [ADR 0009](../decisions/0009-void-state-projected-on-commitments.md)). Remaining M2 verbs (`issue_ntp`, `record_cost`, `record_direct_cost`) land with the corresponding days in [TOOLS.md §6](../../TOOLS.md).
- **Scenario runner** — `packages/dev-tools/src/scenarios/` (layer 2 of ADR 0004). `bun run scenario kitchen [--reset]` drives TOOLS.md §6 as per-Day async functions over MCP HTTP against `bun run dev`. Thin I/O wrapper — correctness lives in layer-1 tool tests. Day 0 shipped; Days 3/10/14/18/60 land as their tools do.
- **D1 + R2 provisioning** — [ADR 0003](../decisions/0003-storage-split.md) locks D1 as the home for domain state and R2 for document blobs. The `packages/database` package owns schema, migrations, and seeds; the D1/R2 providers in `packages/infra/` land alongside (M1). The `GcErpMcp` DO's SQLite remains reserved for MCP-session-runtime state (owned by `agents/McpAgent`).
- **MCP apps (UI components)** — [MCP Apps extension spec](https://modelcontextprotocol.io/extensions/apps/overview). First app targeted at M3 (cost-entry form).
- **Pay-app PDF generation** — M5. Renders G702/G703 from a job's commitment + cost state. Likely a separate `packages/pay-app/` or an inline module on mcp-server.
- **Integrations** — email ingestion for invoices, QuickBooks push, lien-waiver tracking. Milestone-dependent.
- **Broader login methods + scope vocabulary** — [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md) adopts Clerk with its default login surface. Clerk exposes a fixed scope vocabulary (`profile`, `email`, `public_metadata`, `private_metadata`, `openid`); per-tool scopes are out of scope for dogfood. Login methods (magic links, social, SSO) are dashboard toggles if we ever onboard beyond Max + Salman — no Worker-side change.
- **Local dev server lifecycle** — `turbo run dev` runs foreground in a terminal; Claude Desktop's `gc-erp-local` entry only resolves while it's up. [ADR 0011](../decisions/0011-local-mcp-dev-server-foreground.md) rejects daemonization (opacity risk) and shipping a standalone binary (runtime fork). Re-evaluate if the manual-start step materially slows real dogfood sessions.
- **CI** — no GitHub Actions yet. Pre-push + pre-commit cover local discipline; CI enters when remote collaboration does.
- **ADR log** — [docs/decisions/](../decisions/) has the template + one seeded ADR. When a decision is non-obvious enough that we'd otherwise re-litigate it in a year, write an ADR.

---

## 9. Touchpoints if you're new here

Concrete starting points by task:

- **"I want to run it locally."** → [README.md](../../README.md) → First-time setup.
- **"I want to know what it *does*."** → [SPEC.md](../../SPEC.md) → Narrative walkthrough.
- **"I want to know the data-model big ideas."** → [ABSTRACTIONS.md](ABSTRACTIONS.md) → Five load-bearing claims.
- **"I want to change what a tool returns."** → `apps/mcp-server/src/index.ts` → `GcErpMcp.init()`.
- **"I want to change the data model."** → [SPEC.md §1](../../SPEC.md) → `packages/database/src/schema/` (Zod + drizzle colocated per entity).
- **"I want to add a new secret."** → `packages/dev-tools/src/secrets.config.ts`; add to 1Password vault; `turbo run sync-secrets`.
- **"I want to add a new quality check."** → `packages/dev-tools/src/gate/checks.ts` and/or `lefthook.yml`.
- **"The gate is failing and I don't know why."** → `bun run gate` at the repo root prints the output directly; per-check exit codes indicate the failure.
