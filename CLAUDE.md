# CLAUDE.md — gc-erp-mcp-server

> Quick links: [README](README.md) · [SPEC](SPEC.md) · [TOOLS](TOOLS.md) · [Architecture](docs/guides/ARCHITECTURE.md) · [Product overview](docs/product/overview.md) · [Scope](docs/product/scope.md) · [Milestones](docs/product/milestones.md) · [Now](docs/product/now.md) · [Backlog](docs/product/backlog.md) · [Decisions](docs/decisions/) · [Retros](docs/retros/)

## Project overview

A lightweight GC (general contractor) ERP whose product is an **MCP server**. Two operators (Max + Salman) GC their own projects, ~1–5/year; the server exposes the data model, tools, and MCP "apps" (UI components) that a client like Claude Desktop/web/mobile renders. Dogfood-first, not SaaS.

For the product pitch → [docs/product/overview.md](docs/product/overview.md). For scope → [docs/product/scope.md](docs/product/scope.md). For what IS, system-wise → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md). For the data model → [SPEC.md](SPEC.md).

## Repo shape

- `packages/mcp-server/` — Cloudflare Worker (the runtime; ships to production)
- `packages/database/` — SPEC §1 data layer: Zod + Drizzle schemas, migrations, seeds, typed D1 client; imported by mcp-server
- `packages/dev-tools/` — internal CLIs for *local* dev env (gate runner, sync-secrets); never shipped
- `packages/infra/` — internal CLI for *remote* Cloudflare provisioning (custom domain, [later] D1/R2/secrets); never shipped
- `packages/agent-config/` — single source of truth for Claude Code permissions; installs `.claude/settings.json` via `bun install`

Each package has its own `CLAUDE.md` with scope-specific instructions. Read the relevant one before touching a file in that package.

## Development

```bash
bun install                     # workspaces resolve; in main, `prepare` installs lefthook hooks (skipped in worktrees — they share main's hooks)
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

### Agent auto-allow — command shapes

These forms run without a permission prompt (policy lives in [packages/agent-config/src/policy/](packages/agent-config/src/policy/)):

| Shape | Example | Notes |
|---|---|---|
| `bun install …` | `bun install`, `bun install --frozen-lockfile` | |
| `bun run <anything>` | `bun run gate`, `bun run test`, `bun run --cwd packages/mcp-server test`, `bun run --filter @gc-erp/mcp-server test` | Broad glob. Flag position doesn't matter — `--cwd`, `--filter`, and extra args all match. |
| `bun pm view/ls/why …` | `bun pm view drizzle-orm time`, `bun pm ls --all`, `bun pm why esbuild` | Read-only: registry metadata + local-graph introspection. No lockfile mutation. |
| `bunx <tool> …` | `bunx biome check .`, `bunx vitest run`, `bunx tsc --noEmit`, `bunx turbo run test` | Limited to the tools enumerated in `allow.ts` (biome, vitest, commitlint, tsc, turbo). |
| `turbo run <task> …` | `turbo run test --filter=@gc-erp/mcp-server`, `turbo run typecheck` | Works for every task except `deploy` (denied). |
| `git fetch …` | `git fetch`, `git fetch origin feat/m1-data-model` | Updates remote-tracking refs only; no working-tree mutation. |
| `git merge --ff-only …` | `git merge --ff-only origin/feat/m1-data-model` | Fast-forward only — refuses if non-FF, so it can't discard local commits. Safe alternative to `git reset --hard` for base-ref alignment. |
| `git push origin <prefix>/*` | `git push origin slice/3-infra`, `git push -u origin feat/foo` | Conventional-commit prefixes only. Bare `git push` and pushes to `main` stay ASK. |
| `gh pr view/create/comment/edit/ready` | `gh pr create --title …`, `gh pr view 42` | Full list in `allow.ts`. |
| `mkdir -p …` | `mkdir -p packages/database/src/schema` | Scaffolding dirs. Empty-dir creation is reversible; `rm -rf` stays deny. |
| `diff …` | `diff .scratch/pr35.diff .scratch/pr35-v2.diff` | Read-only compare. Pair with `.scratch/` paths, not `/tmp/` — see [Agent conventions](#agent-conventions). |

What **never** auto-runs (by deny):

- `bun run deploy`, `bun run infra:apply`, `bun run infra:teardown` — production surfaces.
- `turbo run deploy`, `wrangler deploy`, `wrangler secret …`, `wrangler login`.
- `git push --force` (any variant), `git reset --hard`, `git branch -D`, `rm -rf …`.
- Secret readers: `cat .envrc.enc`, `cat .dev.vars`, `printenv`, `env`, `op read`, `age -d`, `gh auth token`.

To change what auto-allows or denies, edit [packages/agent-config/src/policy/](packages/agent-config/src/policy/) — never hand-edit `.claude/settings.json` (it's a regenerated build output). See [packages/agent-config/CLAUDE.md](packages/agent-config/CLAUDE.md).

## Invariants

### Architecture

- **Architectural decisions are recorded in `docs/decisions/`** — create an ADR when introducing a new dependency, storage strategy, auth model, cross-cutting pattern, or any "why X over Y" choice. Once active, never edit the substance of an ADR; supersede it. See [docs/decisions/CLAUDE.md](docs/decisions/CLAUDE.md).
- **Spikes live in `docs/spikes/` and are ephemeral** — once resolved, they become an ADR and the spike file is deleted.
- **ARCHITECTURE.md reflects current state, not aspiration.** If a PR changes the architecture, it updates [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) in the same commit.

### Data model + spec

- [SPEC.md](SPEC.md) is the living contract for the data model. Schema-shape forks (what references what, entity grain, invariants) are **co-owned with Max** — surface genuine forks rather than deciding silently.
- Implementation details inside already-agreed shapes (file layout, helper extraction, testing patterns) are autonomous.

### Runtime

- Every `/mcp*` request must be authenticated before delegating to `McpAgent`. **Prod:** Clerk-issued OAuth JWT validated via `@clerk/backend`'s `authenticateRequest({ acceptsToken: "oauth_token" })`; **local:** static bearer token constant-time-compared with `timingSafeEqual`. Selector is `env.CLERK_SECRET_KEY` presence. Never add a path that skips the check. New public endpoints live outside the `/mcp` prefix. See [ADR 0012](docs/decisions/0012-clerk-for-prod-mcp-oauth.md) and [packages/mcp-server/CLAUDE.md](packages/mcp-server/CLAUDE.md).
- Don't replace `timingSafeEqual` with `===` in the local-bearer path. Clerk's JWT validation handles its own timing-safety.
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

- Conventional commits enforced by commitlint on pre-commit-msg.
- Don't chain `git add/commit` with `&&` across calls — risks lock contention between parallel tool uses.
- Feature branches `slice/{n}-{name}` or `<type>/<topic>`; main is the integration branch.
- **Rebase-merge is the only PR merge method, repo-wide.** Repo settings disable merge-commits and squash-merge; rebase-merge is the only allowed method for PRs into *any* branch — `main`, `feat/*` integration branches, `slice/*` feature branches. Use `gh pr merge <n> --rebase --delete-branch`. The commitlint gate at commit time is what makes this safe as the default: PR branches arrive with meaningful conventional-commit history, so rebase-merge preserves real signal on the target branch. `main` additionally has branch protection enforcing PR-only + linear history. **Why repo-wide rebase-merge:** past incident (PR #30) — `feat/dogfood-prep` accumulated merge commits from child PRs (which merged into it via merge-commits, since nothing prevented that), then couldn't rebase-merge into `main`. Max had to temporarily toggle squash-merge back on. Forcing rebase-merge everywhere prevents this shape of dead-end. If a rare PR genuinely needs squashing (WIP-heavy branch), Max temporarily relaxes the repo setting; surface the need rather than trying to work around it.
- **Before suggesting `git reset --hard origin/<branch>`, verify each local commit is reachable from the remote** with `git log origin/<branch> --contains <local-sha>` (run for every local-only sha shown by `git log origin/<branch>..HEAD`). The cost of the lookup is a few seconds; the cost of being wrong is a recovery from `git reflog`. Past incident: a local-only spike commit was claimed to be "already in the squashed merge" — recovered, but ate ~5 minutes. See [retro](docs/retros/2026-04-17-apply-patch-spike-resolution.md). `git reset --hard` is in the deny list anyway, so this guardrail is about *recommending* the operation to the human, not running it directly.

### Agent config

- **`.claude/` is a build output.** It's gitignored and regenerated by `packages/agent-config` on every `bun install`. Never hand-edit `.claude/settings.json`; edit policy in `packages/agent-config/src/policy/*.ts` and commit that. No `settings.local.json` escape hatch.
- **Permission drift goes through a PR.** Adding an allow/deny pattern is a team decision; surface it rather than patching locally.

### Secrets

- Local-only: `MCP_BEARER_TOKEN` (fixed string `dev`). Prod-only: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (Clerk — see [ADR 0012](docs/decisions/0012-clerk-for-prod-mcp-oauth.md)). Everywhere: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. All live in 1Password (`gc-erp` vault).
- Never write secrets to source files, commit messages, or stdout. `.dev.vars` and `.envrc.enc` are the only legitimate on-disk homes and both are gitignored.
- Do not run `wrangler login` — it writes a user-wide OAuth token that bleeds across repos. We use env-var auth via direnv.
- **Verify any CLI flag's exact syntax before routing a secret through it.** Run `<tool> <subcommand> --help` (or check the tool's docs) first, confirm the flag shape, *then* pipe or pass the secret. Past incident (PR #29): `wrangler dev --var CLERK_SECRET_KEY=<live-value>` leaked to stdout because wrangler 4.x expects `KEY:VAL` (colon), not `KEY=VAL` — the malformed flag was echoed back in the error. Key had to be rotated. Preferred shapes: `.dev.vars` (local) or `wrangler secret put <NAME>` reading from stdin (prod). If a CLI flag is the only path, verify it first.

## Agent conventions

- **Per-package CLAUDE.md.** Every package (and every app, when we add `apps/`) has its own CLAUDE.md. When creating a new package, the CLAUDE.md is part of the new-package checklist — see [packages/CLAUDE.md](packages/CLAUDE.md).
- **Co-own the data model.** Schema forks are for Max to resolve. Implementation is for Claude.
- **Verify CLI surfaces before scripting them.** Before authoring a package.json script that invokes a CLI, confirm the flag shape — run `--help`, Read the tool's source, or query its docs via Context7. Writing a script against an imagined CLI wastes a build-loop iteration.
- **New vendor → disposable POC → `docs/guides/<vendor>.md`.** Any time we're about to build against a vendor SDK, auth flow, or API we haven't used in this repo before, assume training data is stale and internal claims are aspirational. The first step is not a slice plan or an ADR — it's a 30–60 min disposable POC (scratch Worker, scratch script, whatever's smallest) against the vendor's current docs, then a short [`docs/guides/<vendor>.md`](docs/guides/) capturing what actually works, what the docs got wrong, and what the minimal working shape is. The ADR and slice then cite the guide. Past incidents the absence of this pattern caused: Stytch false-start (half-day lost to a plan built on assumed behavior — [retro](docs/retros/2026-04-19-stytch-path-a-false-start.md)); `type: "http"` bearer-token claim in `dogfood.md` that wasn't actually supported by Claude Desktop. The forcing function is deliberate: owing a vendor guide means you can't skip the POC.
- **Prefer the dedicated tool over Bash.** Read/Edit/Glob/Grep are the right tools; reach for Bash only when they genuinely can't express the operation.
- **Use `.scratch/` for ephemeral work, not `/tmp`.** Throwaway scripts, intermediate outputs, experiment fixtures — drop them in `.scratch/` at the repo root. It's gitignored and inside the working-dir sandbox, so Read/Edit/Write just work without prompting; `mkdir -p .scratch/` is auto-allowed so the dir materializes on demand. Paths under `/tmp` sit outside the sandbox and prompt on every file-tool call. Not copied into `claude --worktree` worktrees by design — each worktree gets its own fresh scratch. Clean up when you're done; nothing else will.
- **Don't prefix git commands with `git -C <abs-path>` when you're already in the repo.** Permission matching is on the literal command string, so `git -C /Users/mdml/GitHub/gc-erp-mcp-server status` doesn't match `Bash(git status*)` (it starts with `git -C`) and forces an approval prompt. Same issue as `cd <current-dir> && git …` — already called out at the system level. `git` defaults to the current working tree; just run `git status`. Expanding the allowlist to `Bash(git -C * status*)` isn't the fix — the repo path is machine-specific (Max ≠ Salman), and `*` would match any path on disk. Reserve `-C` for the rare case where you genuinely need a *different* worktree, and expect the prompt there.
- **PR reviews go inline in chat, not as GitHub comments.** When reviewing a PR (`gh pr diff` + `gh pr view`), post the review in the conversation — don't `gh pr comment` / `gh pr review`. Reasons: (1) the reviewer (Max) is already in the chat and doesn't need a round-trip to github.com; (2) reviews here are a working conversation, not a final verdict — inline allows follow-up without cluttering the PR's permanent history. Reserve `gh pr comment` for human-to-human context that future-us will actually search the PR for.
- **Two different "worktree agent" things — don't conflate them.**
  - **`claude --worktree <name>`** (CLI command, human-launched) — starts a fresh full Claude Code session in a new worktree, with the same tool surface as a normal session (Write, Edit, Bash, etc.). This is the canonical pattern for "spawn a parallel agent to ship a feature" → it opens a PR back to the feature branch when done. Default for parallel work.
  - **`Agent` tool with `isolation: "worktree"`** (in-conversation subagent) — a sandboxed subagent in a temporary worktree. Observed (2026-04-17) to deny the `Write` tool, so it can't scaffold new files. Appropriate for read/research/analysis tasks where you want to keep the main checkout clean, **not** for shipping new code. If you reach for the Agent tool to "implement feature X in parallel," you almost certainly want `claude --worktree` instead.
- **`claude --worktree` branches from `origin/HEAD`, not your current local branch.** The new worktree checks out `worktree-<name>` based on `origin/HEAD` (typically `origin/main`) regardless of what branch the human was on when they ran it. There is no CLI flag to override. In practice the human usually launched the worktree to continue work on a local feature branch (`slice/N-foo`, `feat/…`) — confirm the intended base before committing. Typical remediation once the human names the branch: `git fetch origin <branch> && git checkout -b <sub-branch> origin/<branch>` (both auto-allowed; settings.json is in [.worktreeinclude](.worktreeinclude) so the policy is in place at session-start). If the worktree's `worktree-<name>` branch already has local commits on top of the wrong base, fall back to `git merge --ff-only origin/<branch>` (auto-allowed; cleanly fast-forwards when there's no divergence, fails loudly when there is) or `git merge origin/<branch>` (plain merge isn't auto-allowed; expect a permission prompt). Caveat: the human's local branch may have unpushed commits that `origin/<branch>` doesn't have — if so, ask them to `git push` first, or confirm they're fine continuing from the remote tip. Worktree first-run plumbing (secret copy, agent-config copy, bootstrap) is handled by [.worktreeinclude](.worktreeinclude) + [packages/agent-config/src/bootstrap.ts](packages/agent-config/src/bootstrap.ts); base-ref alignment is not.

## Session rhythm

How a session flows — applies to humans and agents both. Full walkthrough in [docs/guides/session-workflow.md](docs/guides/session-workflow.md).

- **Start:** read [`now.md`](docs/product/now.md) + last 1–2 [retros](docs/retros/) + `git log --oneline -10` against the feature branch. **Audit the top `now.md` item against the actual code before acting** — doc-vs-code drift is the #1 friction in this repo.
- **Default branching:** feature branch (`slice/N-foo` or `feat/topic`) — either solo-on-branch or parallel agents via `claude --worktree` opening PRs back to the feature branch. Merge to `main` only when the whole feature lands.
- **During:** question → [backlog](docs/product/backlog.md); decision → ADR or SPEC/TOOLS; architecture → [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) same commit; invariant → per-package `CLAUDE.md`.
- **End:** update `now.md` (done → "Recently done", keep ≤3); if anything felt rough or worth remembering, add a one-liner to [`docs/retros/draft.md`](docs/retros/draft.md) — **do not** write a dated retro unless Max explicitly asks ([retros/CLAUDE.md](docs/retros/CLAUDE.md)); commit everything in conventional-commit style. Granularity varies — not one-commit-per-session.

## Quick links for new contributors

- **"I want to run it locally."** → [README.md](README.md) → First-time setup.
- **"I want to know what it *does*."** → [SPEC.md](SPEC.md) → Narrative walkthrough.
- **"I want to know how it's *built*."** → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md).
- **"I want to know how a session *flows*."** → [docs/guides/session-workflow.md](docs/guides/session-workflow.md).
- **"I want to change a tool's response."** → [packages/mcp-server/CLAUDE.md](packages/mcp-server/CLAUDE.md).
- **"I want to change the data model."** → [SPEC.md §1](SPEC.md) + [packages/database/CLAUDE.md](packages/database/CLAUDE.md) → `src/schema/<entity>.ts`.
- **"I want to add a new secret."** → [packages/dev-tools/CLAUDE.md](packages/dev-tools/CLAUDE.md) → `src/secrets.config.ts`.
- **"I want to change what agents can auto-run."** → [packages/agent-config/CLAUDE.md](packages/agent-config/CLAUDE.md) → `src/policy/{allow,deny,mcp}.ts`.
- **"I want to provision or tear down remote infra."** → [packages/infra/CLAUDE.md](packages/infra/CLAUDE.md) → `src/infra.config.ts` and `bun run infra:{status,apply,teardown}`.
- **"I want to make an architectural decision."** → [docs/decisions/CLAUDE.md](docs/decisions/CLAUDE.md) → copy `0000-template.md`.
