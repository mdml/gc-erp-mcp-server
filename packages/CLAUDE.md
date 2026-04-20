# CLAUDE.md — packages/

Conventions for workspace packages under `packages/`.

> **Every package (under `packages/`) and every app (under `apps/`) has its own `CLAUDE.md`.** Package-scoped instructions beat project-wide ones because Claude Code loads the nearest CLAUDE.md for any file it touches. When you create a new package or app, creating its CLAUDE.md is part of the checklist — not a later polish step. The `apps/*` vs `packages/*` split is per [ADR 0013](../docs/decisions/0013-apps-layout-convention.md) — `apps/*` holds user-facing shipping units (the Worker and its UI bundles); `packages/*` holds internal libraries.

## Naming

Package names are **scope nouns or noun-phrases** (`mcp-server`, `dev-tools`, `infra`, `agent-config`) — what the package *is*, not what kind of thing it is. Role words (`lib`, `utils`, `common`, `shared`, `core`) are wrong: they describe a category, not a scope, and tend to grow into dumping grounds. If you can't name a package in one or two words that describe its job, it probably shouldn't be its own package yet.

## New package checklist

When creating a new package:

1. **`package.json`** — `name` is `@gc-erp/<pkg>`, `"private": true`, `"type": "module"`. Scripts at minimum:
   - `test`: `vitest run`
   - `test:coverage`: `vitest run --coverage`
   - `lint`: `biome check .`
   - `format`: `biome check --write --unsafe .`
   - `typecheck`: `tsc --noEmit`
2. **`tsconfig.json`** — extend the project's base settings (ES2022, strict, bundler resolution).
3. **`vitest.config.ts`** — v8 coverage provider; include `src/**/*.ts`; exclude test files and thin I/O wiring (see below). Thresholds follow the project standard (`lines: 90` / per-file `lines: 70`).
4. **Devdeps** — `vitest` and `@vitest/coverage-v8` at exactly the same pinned version as other packages (`bunfig.toml` `exact = true`).
5. **Tests next to source** — `foo.ts` gets `foo.test.ts` in the same directory.
6. **`CLAUDE.md`** — what this package does, key files, testing approach, any package-specific invariants. Keep it short; link to ARCHITECTURE.md for cross-cutting details.

## Coverage exclusion policy

Exclude files from coverage only when they are **thin I/O wiring** with no interesting logic to test:

- CLI entry points (argument parsing + dispatch)
- Process orchestration — files that primarily call `Bun.spawn`, `execSync`, or similar
- Interactive I/O — readline prompts, stdin/stdout plumbing
- Singletons — e.g., walking the filesystem to find the repo root

Do **not** exclude files that contain testable pure logic, even if they also have some I/O. Extract the pure functions and test them directly; exclude only the thin dispatcher.

## What to test

Focus on **pure logic**: validators, parsers, formatters, decision functions, transformations of plain data. These are high-value, low-effort tests and coverage enforcement will naturally reward them.

Avoid heavy mocking of subprocesses or the filesystem just to test orchestration wiring. If a function's only job is to call `Bun.spawn` and check the exit code, exclude it from coverage rather than writing a brittle mock-heavy test.

## Runtime-library vs. tooling packages

Per [ADR 0013](../docs/decisions/0013-apps-layout-convention.md), user-facing shipping units (the Worker, UI bundles) live under `apps/`, not here. Two categories remain under `packages/`:

- **Runtime libraries** — imported into an app's bundle at runtime (`database`). Keep deps lean — every import grows the deployed Worker bundle. No dev-only deps in the runtime-lib's `dependencies`.
- **Tooling packages** (`dev-tools`, `infra`, `agent-config`) are internal — CLIs, scripts, gate runners, build-time config. They never appear in any runtime bundle. Use Bun APIs (`Bun.spawn`, `Bun.file`) freely.

If you're unsure which category a new package belongs to, prefer tooling unless there's a clear reason an app's runtime needs it.
