# CLAUDE.md — packages/

Conventions for workspace packages under `packages/`.

> **Every package (and every app, when we add the `apps/` tree) has its own `CLAUDE.md`.** Package-scoped instructions beat project-wide ones because Claude Code loads the nearest CLAUDE.md for any file it touches. When you create a new package, creating its CLAUDE.md is part of the checklist — not a later polish step.

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

## Runtime vs. tooling packages

Two categories under `packages/`:

- **Runtime packages** ship to production (`mcp-server`). Keep deps lean — every import grows the Worker bundle. No dev-only packages here.
- **Tooling packages** (`dev-tools`) are internal — CLIs, scripts, gate runners. They never appear in the runtime bundle. Use Bun APIs (`Bun.spawn`, `Bun.file`) freely.

If you're unsure which category a new package belongs to, prefer tooling unless there's a clear reason the runtime needs it.
