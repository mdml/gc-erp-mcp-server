# CLAUDE.md — gc-erp-mcp-server

> Quick links: [README](README.md) · [SPEC](SPEC.md) · [Architecture](docs/guides/ARCHITECTURE.md) · [Product overview](docs/product/overview.md) · [Scope](docs/product/scope.md) · [Milestones](docs/product/milestones.md) · [Backlog](docs/product/backlog.md) · [Decisions](docs/decisions/)

## Project overview

A lightweight GC (general contractor) ERP whose product is an **MCP server**. Two operators (Max + Salman) GC their own projects, ~1–5/year; the server exposes the data model, tools, and MCP "apps" (UI components) that a client like Claude Desktop/web/mobile renders. Dogfood-first, not SaaS.

For the product pitch → [docs/product/overview.md](docs/product/overview.md). For scope → [docs/product/scope.md](docs/product/scope.md). For what IS, system-wise → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md). For the data model → [SPEC.md](SPEC.md).

## Repo shape

- `packages/mcp-server/` — Cloudflare Worker (the runtime; ships to production)
- `packages/dev-tools/` — internal CLIs (gate runner, sync-secrets); never shipped

Each package has its own `CLAUDE.md` with scope-specific instructions. Read the relevant one before touching a file in that package.

## Development

```bash
bun install                     # workspaces resolve; lefthook hooks install via `prepare`
turbo run sync-secrets          # pulls secrets from 1Password → .envrc.enc + .dev.vars
direnv allow                    # one-time; direnv auto-loads env on cd thereafter
turbo run dev                   # wrangler dev for the Worker
turbo run typecheck             # tsc --noEmit across all packages
turbo run test                  # vitest across all packages
turbo run lint                  # biome
bun run gate                    # full local gate (lint + typecheck + test)
bun run format                  # biome --write at repo root
turbo run deploy                # deploy Worker to Cloudflare
```

Secrets are encrypted at rest per-developer via age (see [docs/guides/ARCHITECTURE.md §4](docs/guides/ARCHITECTURE.md)). Prereqs: `age`, `direnv`, `op` (1Password CLI), `bun`, `lefthook`, `osv-scanner`. `cs` (CodeScene CLI) is optional — if missing, the code-health gate warns loudly but passes.

## Invariants

### Architecture

- **Architectural decisions are recorded in `docs/decisions/`** — create an ADR when introducing a new dependency, storage strategy, auth model, cross-cutting pattern, or any "why X over Y" choice. Once active, never edit the substance of an ADR; supersede it. See [docs/decisions/CLAUDE.md](docs/decisions/CLAUDE.md).
- **Spikes live in `docs/spikes/` and are ephemeral** — once resolved, they become an ADR and the spike file is deleted.
- **ARCHITECTURE.md reflects current state, not aspiration.** If a PR changes the architecture, it updates [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) in the same commit.

### Data model + spec

- [SPEC.md](SPEC.md) is the living contract for the data model. Schema-shape forks (what references what, entity grain, invariants) are **co-owned with Max** — surface genuine forks rather than deciding silently.
- Implementation details inside already-agreed shapes (file layout, helper extraction, testing patterns) are autonomous.

### Runtime

- Every `/mcp*` request must be bearer-authenticated before delegating to `McpAgent`. Never add a path that skips the check. New public endpoints live outside the `/mcp` prefix.
- Constant-time token compare (`timingSafeEqual`) — don't replace with `===`. See [packages/mcp-server/CLAUDE.md](packages/mcp-server/CLAUDE.md) for more.
- Durable Object migrations are additive. Editing an existing migration retroactively is a data-loss bug.

### Testing

- Tests live next to source: `foo.ts` → `foo.test.ts`.
- Coverage thresholds: `lines: 90` overall, `lines: 70` per file. Enforced per-package in `vitest.config.ts`.
- **Mock boundaries, not collaborators.** If a function fundamentally shells out (`Bun.spawn`, `fetch`), exclude it from coverage rather than mocking `Bun.spawn` to force a number.
- Never invoke test runners directly (`vitest run`, `playwright test`) — always go through `bun run test` so env + resolution are consistent.

### Code quality

- TypeScript strict mode across the board.
- Biome for lint + format. Run `bun run format` before committing if biome flags anything.
- No `any` except third-party type shims.
- Conventional commits (standard types only: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`).

### Dependency security

Enforced at three layers (see [docs/guides/ARCHITECTURE.md §6](docs/guides/ARCHITECTURE.md)):

- **Prevention** (`bunfig.toml`): `exact = true`, `saveTextLockfile = true`, `minimumReleaseAge = 604800` (7-day quarantine; excludes list for Cloudflare packages that ship faster than policy).
- **Scanning** (pre-push): `osv-scanner` on every push; blocks if vulns found.
- **Response**: when a new dep pulls a transitive with an active CVE, prefer architectural elimination over version overrides. Overrides are debt.

### Git

- **Never edit `.claude/settings.local.json`** — it's per-developer local config.
- Conventional commits enforced by commitlint on pre-commit-msg.
- Don't chain `git add/commit` with `&&` across calls — risks lock contention between parallel tool uses.
- Feature branches `slice/{n}-{name}` or `<type>/<topic>`; main is the integration branch.

### Secrets

- `MCP_BEARER_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` live in 1Password (`gc-erp` vault).
- Never write secrets to source files, commit messages, or stdout. `.dev.vars` and `.envrc.enc` are the only legitimate on-disk homes and both are gitignored.
- Do not run `wrangler login` — it writes a user-wide OAuth token that bleeds across repos. We use env-var auth via direnv.

## Agent conventions

- **Per-package CLAUDE.md.** Every package (and every app, when we add `apps/`) has its own CLAUDE.md. When creating a new package, the CLAUDE.md is part of the new-package checklist — see [packages/CLAUDE.md](packages/CLAUDE.md).
- **Co-own the data model.** Schema forks are for Max to resolve. Implementation is for Claude.
- **Verify CLI surfaces before scripting them.** Before authoring a package.json script that invokes a CLI, confirm the flag shape — run `--help`, Read the tool's source, or query its docs via Context7. Writing a script against an imagined CLI wastes a build-loop iteration.
- **Prefer the dedicated tool over Bash.** Read/Edit/Glob/Grep are the right tools; reach for Bash only when they genuinely can't express the operation.

## Quick links for new contributors

- **"I want to run it locally."** → [README.md](README.md) → First-time setup.
- **"I want to know what it *does*."** → [SPEC.md](SPEC.md) → Narrative walkthrough.
- **"I want to know how it's *built*."** → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md).
- **"I want to change a tool's response."** → [packages/mcp-server/CLAUDE.md](packages/mcp-server/CLAUDE.md).
- **"I want to add a new secret."** → [packages/dev-tools/CLAUDE.md](packages/dev-tools/CLAUDE.md) → `src/secrets.config.ts`.
- **"I want to make an architectural decision."** → [docs/decisions/CLAUDE.md](docs/decisions/CLAUDE.md) → copy `0000-template.md`.
