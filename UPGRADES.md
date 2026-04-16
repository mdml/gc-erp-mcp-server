# Upgrade plan

Snapshot: 2026-04-15. Versions checked against `npm registry` + GitHub releases.

## TL;DR

One major (TypeScript 6), a handful of patch bumps, and one policy inconsistency (`turbo` caret vs. exact-pin policy). Most patch bumps are currently **blocked by `minimumReleaseAge = 604800` (7 days)** in `bunfig.toml` — listed below with the date they clear.

## Already on latest — no action

| Package | Version |
| --- | --- |
| `@commitlint/cli` / `config-conventional` / `types` | `20.5.0` |
| `lefthook` | `2.1.5` |
| `@modelcontextprotocol/sdk` | `1.29.0` |
| `agents` | `0.11.0` |
| `zod` | `4.3.6` |
| `@cloudflare/workers-types` | `4.20260415.1` |
| `wrangler` | `4.83.0` |

## Upgrades to take

### 1. TypeScript 5.9.3 → 6.0.2 — major
- Published 2026-03-23; past the 7-day gate.
- Apply in both `packages/mcp-server` and `packages/dev-tools` (identical pin).
- Run `turbo run typecheck` after — new strictness rules (especially around `unknown` narrowing and checked indexed access) may surface errors in existing code.
- Also re-check `tsconfig.json` in each package: TS 6 deprecates a few `lib` flags.

### 2. `turbo ^2.0.0` → `2.9.6` (pin)
- **Policy fix, not just a version bump.** Root `package.json` is the only place using a caret range; everything else is exact per `bunfig.toml` `exact = true`.
- Published 2026-04-10 → **release-age-blocked until 2026-04-17**.
- Change `"turbo": "^2.0.0"` → `"turbo": "2.9.6"` in root `package.json`.

### 3. `bun` toolchain 1.3.10 → 1.3.12
- Update `packageManager: "bun@1.3.10"` in root `package.json` to `bun@1.3.12`.
- Coordinate with team: everyone should `bun upgrade` locally; CI image if pinned.

### 4. `@biomejs/biome` 2.4.10 → 2.4.12 (patch)
- Published 2026-04-14 → **release-age-blocked until 2026-04-21**.
- After bump, also update the `$schema` URL in `biome.json` (`.../schemas/2.4.10/schema.json` → `2.4.12`).

### 5. `vitest` + `@vitest/coverage-v8` 4.1.3 → 4.1.4 (patch)
- Published 2026-04-09 → **release-age-blocked until 2026-04-16** (clears tomorrow).
- Bump in both `packages/mcp-server` and `packages/dev-tools` in the same PR so versions stay aligned.

### 6. `@types/bun` 1.3.11 → 1.3.12
- Published 2026-04-10 → **release-age-blocked until 2026-04-17**.
- `packages/dev-tools` only.

## External tooling (not in `package.json`)

### `osv-scanner` → v2.3.5
- Invoked by `lefthook.yml` pre-push. Not managed by bun, so upgrade wherever it's installed (Homebrew, asdf, CI base image). Verify `osv-scanner scan --config=osv-scanner.toml --lockfile=bun.lock` still works — flag parsing has been stable but worth a dry run.

## Sequencing suggestion

1. Land TypeScript 6 upgrade on its own (biggest blast radius, unrelated to the age-blocked bumps).
2. Fix the `turbo` caret → exact pin when it clears 2026-04-17 (or add `turbo` to `minimumReleaseAgeExcludes` if you want it sooner — but the excludes list is meant for fast-moving deps, not policy workarounds).
3. Batch the remaining patch bumps (biome, vitest, @types/bun, bun toolchain) in one PR once 2026-04-21 passes — they all touch dev-dep plumbing and cleanly coexist.
4. Refresh `osv-scanner` binary outside the PR flow.

## Things to reconsider, not upgrade

- `minimumReleaseAge = 604800` + the `Excludes` list: policy, not a version. The current excludes (`@cloudflare/workers-types`, `agents`, `wrangler`) are well-chosen — Cloudflare ships near-daily. Revisit only if a new dependency exhibits the same cadence.
- `turbo` `globalDependencies` in `turbo.json` only lists `biome.json`; `tsconfig.json` changes from the TS 6 bump won't invalidate `typecheck` caches unless you add it. Consider whether that's intended.
