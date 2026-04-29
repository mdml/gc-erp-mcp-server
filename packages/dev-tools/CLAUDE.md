# CLAUDE.md — packages/dev-tools

Internal CLIs and gate machinery. **Nothing here ships to production** — this package exists to make the monorepo habitable for Max + Salman. Use Bun APIs (`Bun.spawn`, `Bun.file`, `Bun.write`) freely.

## What's here

| File / dir | Role |
|---|---|
| `src/gate/` | Gate runner — orchestrates typecheck/lint/test as subprocesses and prints results. Code Health is **not** part of the gate — it lives in [`scripts/codescene.sh`](../../scripts/codescene.sh) and runs as its own lefthook hook (per ADR 0015 — bun + cs + lefthook parallel deadlocked). |
| `src/gate.ts` | Tiny CLI entry for `bun run gate` |
| `src/scenarios/` | End-to-end scenario runner (TOOLS.md replay). |
| `src/db/` | Migrate / query / seed helpers for D1. |
| `src/install-mcp/` | Generates Claude Desktop / claude.ai connection JSON. |
| `src/*.test.ts` | Vitest suites (coverage-enforced on pure logic only). |

## When to touch this package

- **Adding a new secret** → not here. Per [ADR 0015](../../docs/decisions/0015-dotenvx-secrets-management.md), secrets live in each developer's `.env.local` (`bunx dotenvx set NAME VAL -f .env.local`). If a turbo task's child needs to see it, also add the name to `globalPassThroughEnv` in [turbo.json](../../turbo.json).
- **Adding a new quality check to the gate** → edit `src/gate/checks.ts`. The check is a subprocess invocation; return a `CheckResult`.
- **Adjusting the code-health gate** → not in this package. The gate is bash-driven via [`scripts/codescene.sh`](../../scripts/codescene.sh) and the lefthook `code-health` hooks at the repo root. The gate is strict by design — score-10 floor, no test or dev-tools exclusions, hard-fail on missing CLI/token.
- **Adding a new internal CLI** (e.g. a doctor script) → new file in `src/`, new script in `package.json`. Do NOT make it a dependency of `apps/mcp-server`.

## Testing approach

Coverage is enforced, but honestly — most of this package is shell-out orchestration, which is exactly the case where the [coverage exclusion policy](../CLAUDE.md) says "exclude it, don't mock it."

Test the pure parts:

- `getGateChecks` — gate composition (lint + typecheck + test, with/without coverage)
- output formatting in `gate/runner.ts` (`extractFailureLines`, `formatResults`)

Exclude from coverage:

- `src/gate.ts` — CLI arg parsing + dispatch
- `src/gate/checks.ts` runner functions that spawn subprocesses (but NOT pure helpers inside the same file — export those separately)

## Invariants

- **Never write secrets to stdout or log files.** Anything that crosses a subprocess boundary gets the dotenvx wrapper; nothing in this package should `console.log` decrypted values.
- **Fail loudly on missing prereqs.** If `cs` CLI or `CS_ACCESS_TOKEN` is missing, print a clear message explaining which tool/value is needed and how to add it (`bunx dotenvx set CS_ACCESS_TOKEN <value> -f .env.local`). Do not silently fall back.
- **Code-health gate is strict — no exclusions.** Tests, dev-tools, scenarios — every TS/JS file scores. The gate selects files via `git diff --staged` (pre-commit) or `git diff origin/main...HEAD` (pre-push); the only "skip" is files that don't exist on disk (e.g. deleted in the staged set).

## Don't add

- **Runtime deps the Worker would ever import.** This package is CLI-only; its deps inflate nothing. But if you find yourself importing `packages/dev-tools` from `apps/mcp-server`, stop — the dependency direction is wrong.
- **Another CLI framework.** For v1, plain `process.argv` parsing is enough for the few commands we have. If we ever grow past ~5, consider adding Commander — but not before.
- **Skeletons for the deleted secrets surface.** `sync-secrets.ts`, `secrets.config.ts`, the age/op helpers — all gone per ADR 0015. Don't reintroduce them; if a fresh need shows up, design from scratch with dotenvx as the substrate.
