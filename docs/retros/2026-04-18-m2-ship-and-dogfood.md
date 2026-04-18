---
date: 2026-04-18
slug: m2-ship-and-dogfood
---

# Retro — M2 audit + dogfood infrastructure design

## Context

Session opened expecting to merge PR #18 and deploy M2 to production. Audit step surfaced that #18 was already merged (along with PRs #15 + #17 — all M2 tools on main). Pivoted to: audit the actual code state, design the dogfood tooling infrastructure, document it, and defer implementation to a follow-up session.

## Observations

- **`now.md` had compounded drift.** Items 1 + 2 in "Up next" (`issue_ntp`, `get_scope_tree`) had both landed in PRs #15 + #17 before the session opened. "In flight" (`apply_patch`) had landed in the main sweep months earlier. The doc reflected a plan, not the current state. The audit step caught this immediately — same pattern as the TOOLS.md drift retro (2026-04-17).
- **The seed script was a stub.** `packages/database/src/seed/run.ts` exits 1 with a TODO-from-M1. `seedActivities()` is typed against `BetterSQLite3Database`, not D1. No prod seeding path exists yet. The session brief assumed this was wired — it wasn't. Worth surfacing early rather than discovering it mid-deploy.
- **`install:mcp` has a natural local/prod asymmetry.** Local (Claude Desktop) warrants auto-write + backup because the config file is yours and reversible. Prod (Claude.ai Connectors) warrants print-only because pasting a JSON block into a web UI is the right paper trail — you see what you're adding before it's connected.
- **`MCP_SERVER_URL` is already the `--target` hook.** The scenario runner reads it today. Adding `--target local|prod` is a named alias over an existing seam — no redesign needed, just a thin CLI addition.
- **`db:seed:activities` is the only non-trivial script.** All other scripts are thin wrangler wrappers. The seed script needs to generate SQL INSERTs from `STARTER_ACTIVITIES` and exec them via `wrangler d1 execute`. The data lives in `packages/database`; the runner goes in `packages/dev-tools` — same pattern as the scenario runner.

## Decisions

- **Prod seeding: wrangler-exec SQL** (option a from the session). Consistent with `db:migrate:prod`; no new dependency; `--remote` flag is the prod signal throughout.
- **`install:mcp:local` writes; `install:mcp:prod` prints.** `--remove` flag for local uninstall (single command, tab-completable inverse).
- **`db:query:prod` warns on write verbs.** Pattern: warn + `y/N` + `--yes` override.
- **Script naming is `:local` / `:prod` throughout.** Leaves obvious room for a `:staging` suffix when that target appears. No staging now.
- **Local bearer token is the fixed string `dev`.** Hardcoded in `.dev.vars`; not a real secret. `install:mcp:local` writes `Authorization: Bearer dev` without any secret lookup — nothing sensitive in the Desktop config file. Auth code path stays exercised in both environments (invariant holds); local token is trivial by design because local D1 holds no real data.
- **Plan + confirm pattern for all destructive / prod scripts.** Print plan always (even with `--yes`); prompt `y/N`; `--yes` skips pause. Mirrors `wrangler` / `terraform` behavior.
- **No `db:reset:prod`, no `db:teardown:*`.** Reset-prod is an incident-recovery op. Local teardown is `rm -rf .wrangler/state/v3/d1/` + `db:migrate:local` — reversible and obvious.
- **`db:seed:kitchen-fixture` renamed to `db:seed:kitchen:local`** to match the `:local` / `:prod` convention.

## Actions taken

- `docs/guides/dogfood.md` created — full spec for the script surface, bearer token story, Claude Desktop + mobile config, plan+confirm pattern, prod deploy checklist, rollback story.
- `docs/product/now.md` updated — M2 fully landed; dogfood guide documented; prod deploy + script implementation as next two items.
- Retro logged.

## Deferred

- **Prod deploy** — apply migrations 0001+0002, seed activities, deploy Worker, smoke-test. Blocked on nothing; highest priority next session. See `now.md` item 1.
- **Dogfood scripts implementation** — all `db:*`, `install:mcp:*`, `scenario --target` per `docs/guides/dogfood.md`. `now.md` item 2.
- **`db:seed:activities` stub** in `packages/database/src/seed/run.ts` still exits 1. Will be superseded by the `db:seed:activities:local` implementation in `dev-tools`.
