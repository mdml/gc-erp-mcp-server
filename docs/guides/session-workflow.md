# Session workflow

How a working session flows in this repo. Applies to humans and agents. Cadence varies — a session can be a 20-minute edit or a multi-day feature. The rhythm below is a default, not a gate.

## Branching model

| Mode | When | Integration |
|---|---|---|
| **Solo-on-branch** | Linear work, one agent or one human at a time | Feature branch (`slice/N-foo` or `feat/topic`). Commit directly. |
| **Parallel worktrees** | Independent threads of one feature | Root agent/human holds the feature branch; each parallel agent runs in `claude --worktree` and opens a PR back to the feature branch. |

`main` is the integration branch for whole features. A feature branch merges into `main` only when the feature is done — not at session boundaries.

**Worktree gotcha.** `claude --worktree` bases the new worktree on `origin/HEAD`, *not* your current local branch. If you're mid-flight on a feature branch, tell the worktree agent which branch to base off. Fetch-and-align steps are in the root [CLAUDE.md](../../CLAUDE.md) under "Agent conventions."

## Start of session — orient before acting

The hardest thing isn't picking a task, it's knowing *where the code actually is* vs. what the docs plan. Every session starts here:

1. **Read [`docs/product/now.md`](../product/now.md).** "Up next" is the canonical plan.
2. **Skim the last 1–2 [retros](../retros/).** Carryover from prior sessions lives here.
3. **`git log --oneline -10`** — against the feature branch, not `main`, if you're on one. Worktree mode: log against the feature branch (your PR target), not `main`.
4. **Audit the top `now.md` task against the code.** Spot-check: is its precondition still valid? Has it partly landed on another branch? If drift is found, stop and fix `now.md` (and any affected guide) *before* taking on new work.
5. **Confirm scope with Max** — or state your plan and wait for OK. Don't silently start on item #N.

Target: ~60 seconds to produce "here's where we are, here's what's next, OK to proceed?"

## During a session

| Change | Destination |
|---|---|
| A question surfaces | [`backlog.md`](../product/backlog.md) |
| A decision gets locked | ADR (architectural) or [SPEC.md](../../SPEC.md) / [TOOLS.md](../../TOOLS.md) (data-shape) |
| Architecture changes | Update [`ARCHITECTURE.md`](ARCHITECTURE.md) in the same commit |
| An invariant shifts | Update the relevant per-package `CLAUDE.md` |
| Code ships | Move `now.md` items from "Up next" → "Recently done" |

Commit messages are conventional-commit. Cadence varies — the test is "does this commit message make sense on its own," not "is this one session."

## End of session

1. **Update `now.md`.** Cross off completed items; cap "Recently done" at ~3 (prune older ones out — it's not a log).
2. **Log a [retro](../retros/CLAUDE.md)** if the session made a meaningful change (ADR, schema shift, doc restructure, hard debug). Not every session needs one.
3. **Commit.** The retro is part of the session's commit, not a separate one.
4. **Push.** Solo mode: push the feature branch. Worktree mode: the parallel agent opens or updates a PR back to the feature branch.
5. **Feature → `main` via PR, rebase-merged.** Branch protection enforces PR-only + linear history + rebase-merge; direct pushes, merge commits, and squash-merges are all rejected. Use `gh pr merge <n> --rebase --delete-branch`. Merging to `main` is a deliberate act done when the whole feature is done — not a session boundary. If a PR genuinely needs squashing (rare), flag it for Max to temporarily unlock the rule.

## Parallel worktrees — operating guide

When you launch parallel agents via `claude --worktree`, three details matter:

- **Picking a model: count unreversed decisions.** Near-zero (pattern-matching an existing template — e.g. adding a new provider that mirrors an existing one) → Sonnet is plenty and ~5× cheaper. Three or more real judgment calls (new schema, new architecture, new dep with alternatives) → Opus. The tradeoff inverts fast at 3–5 decisions — a cheaper-but-subtly-wrong Opus-class task produces rework that dwarfs the model-cost delta.
- **Anticipate conflicts before launching.** Before the agents start, eyeball which files both worktrees will touch and brief each with "if you touch file F, take approach X; the other worktree will take approach Y." That 30 seconds of foresight turns rebase resolution into mechanical work instead of a call back to Max at merge time.
- **Force-pushing a rebased branch is human-only.** Policy denies `git push --force*` including `--force-with-lease` (see root [CLAUDE.md](../../CLAUDE.md) auto-allow table). Agents rebase locally, verify with `bun run gate`, then ask the human to run `! git push --force-with-lease origin <branch>`. The `!` prefix runs in-session so output lands in the conversation — no round-trip.

## What tends to go wrong

- **Code-vs-docs drift discovered mid-session.** Stop. Update `now.md` and any affected guide before continuing. *This is the #1 friction in this repo* — the orientation phase exists to catch it before acting.
- **Parallel worktrees colliding.** Aim for non-overlapping file scopes per worktree. If PRs to the feature branch collide, resolve linearly — merge one, rebase the other — rather than trying to merge both at once.

## Relation to other docs

| Doc | What it contains |
|---|---|
| [`docs/product/now.md`](../product/now.md) | Ordered current tasks (the plan) |
| [`docs/product/backlog.md`](../product/backlog.md) | Unresolved questions (not tasks) |
| [`docs/retros/`](../retros/) | What we noticed + what we changed (history) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current state of the system (reality) |
