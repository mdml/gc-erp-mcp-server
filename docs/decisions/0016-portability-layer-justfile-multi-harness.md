---
type: ADR
id: "0016"
title: "Portability layer — Justfile + multi-harness AGENTS.md, sunset agent-config"
status: active
date: 2026-05-11
amended: 2026-05-11
---

> **Amendment, 2026-05-11 (pre-implementation):** flipped the Layer 1 mechanism — `AGENTS.md` is now the canonical project-context file (vendor-neutral filename); `CLAUDE.md` exists alongside as a thin file importing `@AGENTS.md`. The original "symlink AGENTS.md → CLAUDE.md" wording is preserved below for context but is no longer the chosen mechanism. Also reframed the Zed and Codex pieces against verified vendor research: Zed v1.0's Agent Panel + ACP-integrated external agents, and Codex's Starlark `.rules` permission grammar. Substance of layers 0–2 unchanged. See [scope 0](../product/scope/0-foundation.md) §Engineering plan for the concretized sub-step structure.

## Context

Two pressures, both internal to how we develop on this project:

1. **Single-harness lock-in is operationally fragile.** Anthropic's API runs at roughly two-9s reliability and is the most expensive line item in the project's tooling spend. Claude Code is the preferred development harness, but being unable to fall over to another harness (Codex CLI in the terminal; Codex/Claude/other in Zed) during an outage or after a pricing shift is an unhedged risk. The hedge is cheap if structured right.
2. **Each harness has its own permission and config surface.** Claude Code reads `.claude/settings.json` (currently generated from `packages/agent-config`); Codex reads `AGENTS.md` and its own per-agent config; Zed has yet another shape. If "what verbs exist in this project" lives only in `package.json` scripts + `turbo.json` + agent prompts, every new harness picks that surface up from scratch.

These pressures are independent of [ADR 0017](0017-pivot-mcp-server-to-rust-on-fly.md) (the Rust pivot). Even if the Rust pivot doesn't land, the portability-layer work pays back on its own — and lands sooner.

The architectural shape this ADR adopts is a three-layer model:

- **Layer 0 — verbs** in a Justfile, harness-agnostic.
- **Layer 1 — context** in `AGENTS.md` (canonical, vendor-neutral filename); `CLAUDE.md` is a thin file importing `@AGENTS.md` plus any Claude-Code-specific notes. Same pattern per package.
- **Layer 2 — harness-specific config** (`.claude/`, `.codex/`, `.zed/`), kept thin and delegating to layers 0/1.

Current state worth naming explicitly:

- `package.json` scripts and `turbo run *` are the de-facto verb surface. They work in any harness but require each harness to learn them anew.
- `packages/agent-config` codifies Claude-Code-specific permissions as TypeScript policy → `.claude/settings.json` (regenerated on `bun install`). No parallel exists for Codex or Zed; the package is single-harness by design ([ADR 0013](0013-apps-layout-convention.md) and CLAUDE.md formalized this).
- No `AGENTS.md` at the repo root. Codex would read CLAUDE.md only by accident.

## Decision

**Adopt a vendor-neutral portability layer:**

- **Justfile at repo root** as the canonical agent-facing verb surface. Recipes wrap current `bun` and `turbo run *` invocations; secrets routed through a single `_dotenv` (or equivalent) variable; `default` recipe runs `just --list` so any harness — and any human — discovers the surface immediately. Recipes earn inclusion when they meet at least one of: touches secrets, multi-step composition, varies across environments, used cross-machine, encodes a project convention behind a short verb. Bare wrappers around single commands that already work (`just ls`) don't qualify.
- **`AGENTS.md` at repo root as canonical project-context file.** Vendor-neutral filename; Codex reads it directly. `CLAUDE.md` exists alongside as a thin file: `@AGENTS.md` import (Claude Code's native include directive) plus any Claude-Code-specific notes. Same pattern per package. Verified pre-amendment that Claude Code reads only `CLAUDE.md`, not `AGENTS.md` — the stub is required.
- **Zed v1.0 as agent host.** Use Zed's Agent Panel to launch parallel external-agent threads (Claude Code, Codex) over the Agent Client Protocol (ACP). Worktree-create wired via `.zed/tasks.json`'s `create_worktree` hook to `scripts/bootstrap.sh`; same script runs for `claude --worktree` via `.worktreeinclude` + a SessionStart hook. We do *not* use Zed's own "Zed Agent" thread type (Zed's native AI loop). Setup captured in [`docs/guides/zed.md`](../guides/zed.md).
- **Sunset `packages/agent-config`.** Delete the package; remove its `bun install` hook; let each harness manage its own permission surface against the narrow `Bash(just *)` allow + a small deny-list. Concretely: a narrow hand-maintained `.claude/settings.json` for Claude Code; a `.codex/config.toml` plus Starlark `.codex/rules/*.star` files for Codex (per Codex's `prefix_rule` grammar). Codex specifics captured in [`docs/guides/codex.md`](../guides/codex.md), including the trust-gate footgun (repo-local `.codex/config.toml` doesn't load until the user accepts the trust prompt on first run). For solo-operator work the policy-as-code overhead doesn't pay back. The Justfile's git-tracked nature provides the audit trail (adding a recipe is a deliberate commit; that's the review surface).

Lands as one PR/slice (`feat/portability-layer`). Independent of ADR 0015; recommended to ship first because it validates the multi-harness story before there's a Rust port to drive through it.

## Options considered

- **A (chosen): Justfile + AGENTS.md + Zed multi-agent + sunset `agent-config`.** Internally consistent — every layer of the three-layer portability model gets addressed. Removes a package; doesn't add one (Justfile is a single root file).
- **B (rejected): Keep `agent-config`, extend it to emit Codex config too.** Doubles policy maintenance for solo-operator work. Codex's permission model differs enough from Claude's that the policy-as-code abstraction would leak. The `Bash(just *)` allow + per-harness defaults pattern is enough.
- **C (rejected): No portability work; tolerate Claude Code dependence.** Internally consistent if we believe Anthropic's reliability and pricing are durable. Both are bets; this ADR's cost is low enough that hedging is the boring-correct call.
- **D (rejected): Justfile-only (no Zed / no Codex setup yet).** Half measure. Without proving multi-harness actually works end-to-end on this repo, the Justfile is unmotivated refactoring. The Zed + Codex piece is the forcing function that validates the layer-0 / layer-2 split.

## Consequences

**Easier:**

- Vendor portability — Claude Code outage, pricing change, or feature lag don't block work; we can fall over to Codex in Zed (or to Codex CLI in the terminal) without learning the project anew.
- Multi-agent flow inside Zed: Opus for planning, Codex for building, others when useful. Heterogeneous agent setup at low coordination cost.
- One verb surface — `just --list` — replaces "read `package.json`, then `turbo.json`, then the README, then ask the existing agent." Discoverable by humans and every harness identically.
- Fewer packages to maintain (`agent-config` deleted). One less moving part in `bun install`. Less Claude-specific code to keep aligned with policy.
- Salman (or any future contributor) gets a consistent entry point regardless of which harness they're in.
- Future cross-language work (e.g. ADR 0015's Rust pivot) plugs into the Justfile cleanly — agents already call `just check`; the recipe internals expand to shell out to `cargo`, no agent re-training required.

**Harder:**

- Initial setup cost: Zed install + configuration; Codex CLI install + auth; learning Codex's UX where it differs from Claude Code's.
- Justfile is one more thing to learn. The DSL is small but unfamiliar to anyone who hasn't used it.
- Per-harness config still exists — Justfile compresses but doesn't eliminate it. We'll have a `.claude/` directory and a Codex-equivalent and a Zed-equivalent. The discipline is keeping each thin and delegated to layer 0.
- "What does this Justfile recipe do" sometimes hides bun/turbo specifics. Anti-pattern to watch for: recipe-as-script-dump; mitigated by extracting to `scripts/foo.sh` if a recipe grows past ~5 lines.
- `bun install` no longer auto-installs Claude permissions. After `agent-config` sunset, if a permission needs to change, that's a manual `.claude/settings.json` edit (or moves to a much smaller in-repo settings file). Acceptable for solo-operator scale.

**Rollback plan:**

PR-revertable. No data, no prod surface, no migrations. If the multi-harness experiment doesn't pay off:

- Drop the Codex / Zed pieces; keep the Justfile (it stands on its own as a verb-consolidation win).
- Or revert the whole PR — original `agent-config` package + `bun install` hook are recoverable from git.

**Trigger for re-evaluation:**

- `just` itself becomes unmaintained or shows real friction — `make` is the next-best-known fallback (less ergonomic but ubiquitous).
- Codex experience materially worse than Claude Code such that multi-harness isn't worth maintaining — sunset Codex, keep Justfile + AGENTS.md (still valuable as portability hedge for *future* harnesses).
- A second active operator (Salman, or anyone else) joins regularly and the multi-harness story actively confuses things — collapse to a single recommended harness for the contributor flow; Justfile + AGENTS.md still fine.

## Advice

Decision shaped in chat (2026-05-11). The three-layer portability model and Justfile-as-command-surface pattern are well-established outside this project (Justfile usage is widespread across language ecosystems for exactly the verb-portability reason adopted here); this ADR is local extraction, not invention.
