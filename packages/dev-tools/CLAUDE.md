# CLAUDE.md — packages/dev-tools

Internal CLIs and gate machinery. **Nothing here ships to production** — this package exists to make the monorepo habitable for Max + Salman. Use Bun APIs (`Bun.spawn`, `Bun.file`, `Bun.write`) freely.

## What's here

| File / dir | Role |
|---|---|
| `src/sync-secrets.ts` | Reads `secrets.config.ts` + `.env.op.local`, fetches values from 1Password via `op`, writes `.envrc.enc` (age) + `.dev.vars` |
| `src/secrets.config.ts` | Two lists: `teamSecrets` (baked `op://` refs, hard-fail) and `developerSecrets` (name + description only; per-developer refs live in `.env.op.local`, warn-and-skip) |
| `src/gate/` | Gate runner — orchestrates typecheck/lint/test/code-health as subprocesses and prints results |
| `src/gate.ts` | Tiny CLI entry for `bun run gate` |
| `src/code-health.ts` | Per-file Code Health CLI used by the pre-commit hook. Shares parsing + dispatch logic with the gate via `gate/checks.ts` — they're two front-ends over the same pure `parseCodeHealthOutput` + `checkFileHealth` helpers. |
| `src/install-mcp.ts` | `bun run install:mcp:local` — patches `~/Library/Application Support/Claude/claude_desktop_config.json` with the `gc-erp-local` MCP server entry. Resolves Homebrew's `npx` (Node ≥18) to sidestep Claude Desktop's stale launch-services PATH (see [docs/guides/dogfood.md §Node version caveat]). Pure helpers (`buildLocalEntry`, `patchConfig`, `removeServer`) tested in `install-mcp.test.ts`; the file is excluded from coverage as a whole because the orchestration is filesystem I/O. |
| `src/*.test.ts` | Vitest suites (coverage-enforced on pure logic only) |

## When to touch this package

- **Adding a new team secret** → add it to `teamSecrets` in `src/secrets.config.ts` (with its `op://gc-erp/...` ref) and create the corresponding item in 1Password. Run `turbo run sync-secrets`.
- **Adding a new developer secret** → add it to `developerSecrets` in `src/secrets.config.ts` (name + description only, no ref), add the matching line to `.env.op.local.example` (blank value), and document in the description what gate it unlocks. Each developer then maps it to their personal `op://` ref in `.env.op.local`.
- **Adding a new quality check to the gate** → edit `src/gate/checks.ts`. The check is a subprocess invocation; return a `CheckResult`.
- **Adding a new internal CLI** (e.g. a doctor script) → new file in `src/`, new script in `package.json`. Do NOT make it a dependency of `packages/mcp-server`.

## Testing approach

Coverage is enforced, but honestly — most of this package is shell-out orchestration, which is exactly the case where the [coverage exclusion policy](../CLAUDE.md) says "exclude it, don't mock it."

Test the pure parts:

- age-pubkey parsing from a keyfile
- dotenv body construction from `(name, value)` pairs
- `secrets.config.ts` shape validation
- output formatting in `gate/runner.ts` (`extractFailureLines`, `formatResults`)

Exclude from coverage:

- `src/sync-secrets.ts` — orchestration entry point that calls `op` + `age` as subprocesses
- `src/gate.ts` — CLI arg parsing + dispatch
- `src/gate/checks.ts` runner function(s) that spawn subprocesses (but NOT pure helpers inside the same file — export those separately)
- `src/secrets.config.ts` — pure declarative data, no logic

## Invariants

- **Never write secrets to stdout or log files.** `sync-secrets` handles them in memory, encrypts/writes to disk, and prints only status lines (`"wrote .envrc.enc"`, counts, etc). Debugging? Use a temp file you delete, or redact.
- **Fail loudly on missing prereqs.** If `op`, `age`, or the developer's age key is missing, print a clear message explaining which tool is needed and how to install it. Do not silently fall back.
- **Team 1Password refs live in `secrets.config.ts` — developer refs do not.** The project declares *what* developer secrets exist and *why*, but never *where in a personal 1Password vault* they live. Personal refs belong in `.env.op.local` (gitignored). Don't "helpfully" bake a developer's vault path into the config.
- **Atomic writes.** `.envrc.enc` is written to a temp file and renamed, not streamed in place — a crash mid-write should never leave a partial encrypted file that direnv can't decrypt.

## Don't add

- **Runtime deps the Worker would ever import.** This package is CLI-only; its deps inflate nothing. But if you find yourself importing `packages/dev-tools` from `packages/mcp-server`, stop — the dependency direction is wrong.
- **Another CLI framework.** For v1, plain `process.argv` parsing is enough for the ~2 commands we have. If we ever grow past ~5, consider adding Commander — but not before.
