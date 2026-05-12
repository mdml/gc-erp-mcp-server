# AGENTS.md — gc-erp-mcp-server

> Quick links: [README](README.md) · [SPEC](SPEC.md) · [TOOLS](TOOLS.md) · [Abstractions](docs/guides/ABSTRACTIONS.md) · [Architecture](docs/guides/ARCHITECTURE.md) · [Product overview](docs/product/overview.md) · [Scopes](docs/product/scope/) · [Now](docs/product/now.md) · [Backlog](docs/product/backlog.md) · [Decisions](docs/decisions/) · [Retros](docs/retros/)

## Project overview

A lightweight GC (general contractor) ERP whose product is an **MCP server**. Two operators (Max + Salman) GC their own projects, ~1–5/year; the server exposes the data model, tools, and MCP "apps" (UI components) that a client like Claude Desktop/web/mobile renders. Dogfood-first, not SaaS.

For the product pitch → [docs/product/overview.md](docs/product/overview.md). For the prioritized scopes → [docs/product/scope/](docs/product/scope/). For what IS, system-wise → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md). For the data model → [SPEC.md](SPEC.md).

## Repo shape

- `apps/mcp-server/` — Cloudflare Worker (the runtime; ships to production). Lives under `apps/` per [ADR 0013](docs/decisions/0013-apps-layout-convention.md): `apps/*` holds user-facing shipping units (the Worker plus future UI bundles like `apps/cost-entry-form/`); `packages/*` holds internal libraries.
- `packages/database/` — SPEC §1 data layer: Zod + Drizzle schemas, migrations, seeds, typed D1 client; imported by mcp-server
- `packages/dev-tools/` — internal CLIs for *local* dev env (gate runner, code-health CLI, scenario runner, db helpers); never shipped
- `packages/infra/` — internal CLI for *remote* Cloudflare provisioning (custom domain, [later] D1/R2/secrets); never shipped

Each package has its own `AGENTS.md` (with a thin `CLAUDE.md` stub importing it) for scope-specific instructions. Read the relevant one before touching a file in that package.

## Development

```bash
just bootstrap                  # idempotent: install deps + (in fresh Zed worktrees) copy env files
just check                      # full local gate (lint + typecheck + test + code-health)
just test                       # vitest across all workspaces
just deploy                     # deploy Worker (dotenvx-wrapped for CF creds)
just --list                     # discover all recipes

bunx dotenvx set NAME VAL -f .env.local  # seed secrets (per ADR 0015) — see README for the list
bun run format                  # biome --write at repo root (one-off; not yet a just recipe)
```

`just` is the canonical verb surface ([ADR 0016](docs/decisions/0016-portability-layer-justfile-multi-harness.md)). Direct `bun run …` / `turbo run …` / `bunx dotenvx …` still work for one-offs but won't auto-allow under the agent permission policy — see [Agent auto-allow](#agent-auto-allow--command-shapes).

Secrets are encrypted at rest per-developer via [dotenvx](https://dotenvx.com) — `.env.local` (encrypted body) + `.env.keys` (private key), both gitignored, both per-developer. Decryption is per-process; the parent shell never holds plaintext. See [docs/guides/ARCHITECTURE.md §4](docs/guides/ARCHITECTURE.md) and [ADR 0015](docs/decisions/0015-dotenvx-secrets-management.md). Prereqs: `bun`, `lefthook`, `osv-scanner`, `cs` (CodeScene CLI — required: code-health hard-fails without it). `dotenvx` itself is a workspace devDep, resolved via `bunx`.

### Agent auto-allow — command shapes

Policy lives in [`.claude/settings.json`](.claude/settings.json) (hand-maintained; tracked in git). The principle: collapse the verb surface through `just`, then allow `Bash(just *)` plus a small fixed set of read-only / safe-write Bash commands.

| Shape | Example | Notes |
|---|---|---|
| `just <recipe>` | `just check`, `just test`, `just deploy`, `just bootstrap` | The primary verb surface. `just --list` to discover. |
| `git <read-only>` | `git status`, `git diff`, `git log`, `git show`, `git fetch`, `git branch`, `git blame`, `git rev-parse`, `git ls-files`, `git worktree list`, `git remote -v` | Read-only inspection. |
| `git <local-write>` | `git add`, `git commit -m`, `git switch`, `git checkout -b`, `git stash`, `git restore --staged`, `git mv`, `git rm` | Local-only writes. |
| `git push origin <prefix>/*` | `git push origin slice/3-infra`, `git push -u origin feat/foo` | Conventional-commit prefixes only. Bare `git push` and pushes to `main` stay ASK. |
| `git merge --ff-only …` | `git merge --ff-only origin/feat/m1-data-model` | Fast-forward only — refuses if non-FF. Safe alternative to `git reset --hard`. |
| `gh pr <verb>` | `gh pr view 42`, `gh pr create --title …`, `gh pr diff 42` | Full list in `.claude/settings.json`. Read-only + safe-write subcommands; bare `gh pr merge` stays ASK. |
| `bun pm view/ls/why` | `bun pm view drizzle-orm time`, `bun pm why esbuild` | Read-only registry + local-graph introspection. No lockfile mutation. |
| `ls`, `tree`, `mkdir -p`, `diff`, `jq`, `yq`, `wc`, `pwd` | `ls packages/database/src`, `mkdir -p .scratch/foo` | Read-only inspection + safe scaffolding. |

What **never** auto-runs (by deny):

- Production surfaces: `bun run deploy`, `bun run infra:apply`, `bun run infra:teardown`, `turbo run deploy`, `wrangler deploy`, `wrangler secret …`, `wrangler login`.
- Destructive: `git push --force` (any variant), `git reset --hard`, `git branch -D`, `rm -rf …`, `git clean -f*`, `git filter-branch`, `git filter-repo`.
- Secret readers: `cat .env.local`, `cat .env.keys`, `cat .env*` (broad), `printenv`, `env`, `gh auth token`.

To change what auto-allows or denies, edit [`.claude/settings.json`](.claude/settings.json) directly — it's hand-maintained per [ADR 0016 Slice A.4](docs/decisions/0016-portability-layer-justfile-multi-harness.md). Codex's equivalent lives in [`.codex/config.toml`](.codex/config.toml) + [`.codex/rules/`](.codex/rules/) (Starlark `prefix_rule` grammar — see [docs/guides/codex.md](docs/guides/codex.md)). Each harness manages its own permission surface; we don't render from a single source.

## Invariants

### Architecture

- **Architectural decisions are recorded in `docs/decisions/`** — create an ADR when introducing a new dependency, storage strategy, auth model, cross-cutting pattern, or any "why X over Y" choice. Once active, never edit the substance of an ADR; supersede it. See [docs/decisions/CLAUDE.md](docs/decisions/AGENTS.md).
- **Spikes live in `docs/spikes/` and are ephemeral** — once resolved, they become an ADR and the spike file is deleted.
- **ARCHITECTURE.md reflects current state, not aspiration.** If a PR changes the architecture, it updates [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) in the same commit.

### Data model + spec

- [SPEC.md](SPEC.md) is the living contract for the data model. Schema-shape forks (what references what, entity grain, invariants) are **co-owned with Max** — surface genuine forks rather than deciding silently.
- Implementation details inside already-agreed shapes (file layout, helper extraction, testing patterns) are autonomous.

### Runtime

- Every `/mcp*` request must be authenticated before delegating to `McpAgent`. **Prod:** Clerk-issued OAuth JWT validated via `@clerk/backend`'s `authenticateRequest({ acceptsToken: "oauth_token" })`; **local:** static bearer token constant-time-compared with `timingSafeEqual`. Selector is `env.CLERK_SECRET_KEY` presence. Never add a path that skips the check. New public endpoints live outside the `/mcp` prefix. See [ADR 0012](docs/decisions/0012-clerk-for-prod-mcp-oauth.md) and [apps/mcp-server/CLAUDE.md](apps/mcp-server/AGENTS.md).
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

- **`.claude/settings.json` is hand-maintained, tracked in git.** No regenerator. Adding an allow/deny pattern is a deliberate commit. No `settings.local.json` escape hatch.
- **Codex's equivalent is `.codex/config.toml` + `.codex/rules/*.star`.** Each harness manages its own permission surface — Claude uses JSON globs, Codex uses Starlark `prefix_rule` — and we deliberately don't render both from a meta-policy (per [ADR 0016](docs/decisions/0016-portability-layer-justfile-multi-harness.md)).
- **Permission drift goes through a PR.** Both harnesses' files are tracked; surface a permission change rather than patching locally.

### Secrets

- **Storage:** [dotenvx](https://dotenvx.com) per [ADR 0015](docs/decisions/0015-dotenvx-secrets-management.md). Per-developer `.env.local` (encrypted body) + `.env.keys` (private key) at the repo root. Both gitignored. Decryption is per-process via `bunx dotenvx run -f .env.local -- <cmd>`; the parent shell never holds plaintext.
- **What's a secret vs not:** `MCP_BEARER_TOKEN="dev"` is a public local-dev literal — lives in committed `apps/mcp-server/wrangler.jsonc` `vars`, NOT in `.env.local`. Real secrets in `.env.local`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (deploy), `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (rotation only — prod values live in Cloudflare's secret store), `CS_ACCESS_TOKEN` (code-health gate), `GH_TOKEN` (gh CLI).
- **Never write secrets to source files, commit messages, or stdout.** `.env.local` and `.env.keys` are the only legitimate on-disk homes and both are gitignored. Don't pipe a decrypted value through any CLI without confirming where it lands.
- **Do not run `wrangler login`** — it writes a user-wide OAuth token that bleeds across repos. We use env-var auth — wrap wrangler in `bunx dotenvx run -f .env.local --` so each invocation gets the creds.
- **Verify any CLI flag's exact syntax before routing a secret through it.** Run `<tool> <subcommand> --help` (or check the tool's docs) first, confirm the flag shape, *then* pipe or pass the secret. Past incident (PR #29): `wrangler dev --var CLERK_SECRET_KEY=<live-value>` leaked to stdout because wrangler 4.x expects `KEY:VAL` (colon), not `KEY=VAL` — the malformed flag was echoed back in the error. Key had to be rotated. Preferred shapes: process-env via `bunx dotenvx run` (everywhere) or `wrangler secret put <NAME>` reading from stdin (prod). If a CLI flag is the only path, verify it first.

## Agent conventions

- **Per-package CLAUDE.md.** Every package (and every app, when we add `apps/`) has its own CLAUDE.md. When creating a new package, the CLAUDE.md is part of the new-package checklist — see [packages/CLAUDE.md](packages/AGENTS.md).
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
- **`claude --worktree` branches from `origin/HEAD`, not your current local branch.** The new worktree checks out `worktree-<name>` based on `origin/HEAD` (typically `origin/main`) regardless of what branch the human was on when they ran it. There is no CLI flag to override. In practice the human usually launched the worktree to continue work on a local feature branch (`slice/N-foo`, `feat/…`) — confirm the intended base before committing. Typical remediation once the human names the branch: `git fetch origin <branch> && git checkout -b <sub-branch> origin/<branch>` (both auto-allowed; settings.json is in [.worktreeinclude](.worktreeinclude) so the policy is in place at session-start). If the worktree's `worktree-<name>` branch already has local commits on top of the wrong base, fall back to `git merge --ff-only origin/<branch>` (auto-allowed; cleanly fast-forwards when there's no divergence, fails loudly when there is) or `git merge origin/<branch>` (plain merge isn't auto-allowed; expect a permission prompt). Caveat: the human's local branch may have unpushed commits that `origin/<branch>` doesn't have — if so, ask them to `git push` first, or confirm they're fine continuing from the remote tip. Worktree first-run plumbing (secret copy, deps install) is handled by [.worktreeinclude](.worktreeinclude) + [scripts/bootstrap.sh](scripts/bootstrap.sh) (fired by Zed's `create_worktree` task, Claude Code's `SessionStart` hook, and Codex's `SessionStart` hook); base-ref alignment is not.

## Session rhythm

How a session flows — applies to humans and agents both. Full walkthrough in [docs/guides/session-workflow.md](docs/guides/session-workflow.md).

- **Start:** read [`now.md`](docs/product/now.md) + last 1–2 [retros](docs/retros/) + `git log --oneline -10` against the feature branch. **Audit the top `now.md` item against the actual code before acting** — doc-vs-code drift is the #1 friction in this repo.
- **Default branching:** feature branch (`slice/N-foo` or `feat/topic`) — either solo-on-branch or parallel agents via `claude --worktree` opening PRs back to the feature branch. Merge to `main` only when the whole feature lands.
- **During:** question → [backlog](docs/product/backlog.md); decision → ADR or SPEC/TOOLS; architecture → [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) same commit; invariant → per-package `CLAUDE.md`.
- **End:** update `now.md` (done → "Recently done", keep ≤3); if anything felt rough or worth remembering, add a one-liner to [`docs/retros/draft.md`](docs/retros/draft.md) — **do not** write a dated retro unless Max explicitly asks ([retros/CLAUDE.md](docs/retros/AGENTS.md)); commit everything in conventional-commit style. Granularity varies — not one-commit-per-session.

## Quick links for new contributors

- **"I want to run it locally."** → [README.md](README.md) → First-time setup.
- **"I want to know what it *does*."** → [SPEC.md](SPEC.md) → Narrative walkthrough.
- **"I want to know the data-model *big ideas*."** → [docs/guides/ABSTRACTIONS.md](docs/guides/ABSTRACTIONS.md) → Five load-bearing claims.
- **"I want to know how it's *built*."** → [docs/guides/ARCHITECTURE.md](docs/guides/ARCHITECTURE.md).
- **"I want to know how a session *flows*."** → [docs/guides/session-workflow.md](docs/guides/session-workflow.md).
- **"I want to change a tool's response."** → [apps/mcp-server/CLAUDE.md](apps/mcp-server/AGENTS.md).
- **"I want to change the data model."** → [SPEC.md §1](SPEC.md) + [packages/database/CLAUDE.md](packages/database/AGENTS.md) → `src/schema/<entity>.ts`.
- **"I want to add a new secret."** → `bunx dotenvx set NAME VAL -f .env.local` (per ADR 0015). If it needs to reach a turbo task's child process, also add the name to `globalPassThroughEnv` in [turbo.json](turbo.json).
- **"I want to change what agents can auto-run."** → [`.claude/settings.json`](.claude/settings.json) (Claude Code) and [`.codex/rules/`](.codex/rules/) + [`.codex/config.toml`](.codex/config.toml) (Codex). Hand-maintained per harness.
- **"I want to provision or tear down remote infra."** → [packages/infra/CLAUDE.md](packages/infra/AGENTS.md) → `src/infra.config.ts` and `bun run infra:{status,apply,teardown}`.
- **"I want to make an architectural decision."** → [docs/decisions/CLAUDE.md](docs/decisions/AGENTS.md) → copy `0000-template.md`.
