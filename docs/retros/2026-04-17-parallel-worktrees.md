---
date: 2026-04-17
slug: parallel-worktrees
---

# Retro — parallel worktrees for M1 tasks 1–3

## Context

Landed M1 tasks 1–3 ([`now.md`](../product/now.md)) in one session via two parallel `claude --worktree` agents (Sonnet for infra, Opus for schema), plus a side PR to harden agent auto-allow. Three PRs reviewed, all merged into `feat/m1-data-model`.

## Observations

- **Parallel worktrees paid off** despite overlapping ARCHITECTURE.md touches — wall-clock win real, conflict resolution was mechanical because both sides were briefed. Predicted the ARCHITECTURE.md conflict pre-launch; took 30 seconds to resolve at rebase time.
- **Model split felt invisible in review quality** — both PRs came in clean. The *theoretical* justification (count unreversed decisions) still holds: Sonnet got the pattern-match task, Opus got the schema judgment calls. Faster + cheaper for A wasn't wrong, just quiet.
- **Inline PR reviews beat GitHub comments** for an in-session reviewer. Two reviews went to GitHub before Max redirected; the inline version read tighter and let follow-up happen without a page-switch.
- **`git reset --hard` in worktree base-ref alignment stayed denied** — agents kept hitting the deny policy for the legitimate use case ("align with `origin/<branch>`"). Side PR #3 added `git merge --ff-only*` as the safe replacement.
- **Force-push after local rebase must be human-run** via `!` prefix. Agents can't `--force-with-lease` (deny policy covers all `--force*` variants). That's the right tradeoff for this repo, but it wasn't documented anywhere.
- **Lefthook `prepare` hook misfires.** Every `bun install` and branch switch fired the "core.hooksPath is set locally" error, even in the main checkout post-fix (`2d0c825`). The error is non-fatal (install continues via `--ignore-scripts`) but it's noise every session and hides real failures.
- **Doc-vs-code drift in "aspirational language"** surfaced again on PR #2 — `packages/database/CLAUDE.md` described a Zod-parser reconstruction helper that didn't exist yet. Fix pattern: rewrite responsibility-shifting text ("the consumer is responsible until X lands") instead of implying the helper exists.
- **Schema fork conventions held.** PR #2 surfaced 5 schema-mapping forks (discriminated-union storage, activation normalization, branded-ID generation, Money reconstruction, D1-test strategy) and resolved them with Max in-thread rather than deciding silently. The co-ownership rule works.

## Decisions

- **"Count unreversed decisions" is the canonical model-selection heuristic.** Near-zero → Sonnet; 3+ → Opus. Codify in [session-workflow.md](../guides/session-workflow.md).
- **Pre-launch conflict briefing is a practice, not a rule.** Before parallel worktrees start, name the files both will touch and tell each agent how to resolve. Keeps humans off the critical path at merge.
- **Force-push workflow is human-run via `!` prefix.** Documented in [session-workflow.md](../guides/session-workflow.md) so future agents know the escape hatch.
- **Inline PR reviews are the default going forward.** Root [CLAUDE.md](../../CLAUDE.md) "Agent conventions" captures this; `gh pr comment` is reserved for human-to-human context.

## Actions taken

- Merged: PR #1 (D1 + R2 providers), PR #2 (`packages/database`), PR #3 (auto-allow expansion). `feat/m1-data-model` at `17e996b`.
- Added "Parallel worktrees — operating guide" section to [session-workflow.md](../guides/session-workflow.md): model selection, pre-launch conflict briefing, human-only force-push.
- Added inline-PR-review rule to root [CLAUDE.md](../../CLAUDE.md) "Agent conventions."
- Updated [`now.md`](../product/now.md) — tasks 1–3 → "Recently done"; 4 (first tools) + 5 (kitchen-fixture seed) remain; added first-live-infra-apply as an explicit next step.

## Deferred

- **Lefthook `prepare` hook fix.** "core.hooksPath is set locally" fires on every `bun install` in the main checkout despite the gate in `2d0c825`. Either the condition doesn't cover the direnv-loaded-env case, or there's a second invocation path that also needs gating. Owner: next session touching `packages/agent-config/src/bootstrap.ts`. Not a backlog item (it's a bug, not a question) — surfaces here so the next toucher sees it.
- **Update the `claude --worktree` bullet in root [CLAUDE.md](../../CLAUDE.md) "Agent conventions"** to point at `git merge --ff-only origin/<branch>` as the primary remediation instead of `git reset --hard origin/<branch>` (the latter still works conceptually but is denied by policy and misleading to document). Small follow-up; ~2-minute edit.
