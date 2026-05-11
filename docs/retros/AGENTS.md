---
name: retros
description: How retros work in this repo — two-fold pattern (draft.md queue + human-initiated retros)
---

# Retros — Agent instructions

Retros in this repo follow a **two-fold pattern**:

1. **`draft.md` is the queue.** Agents log retro-worthy observations to [`draft.md`](draft.md) as they happen. One-liners, not essays.
2. **Retros are Max-initiated.** Max decides when to run one. The retro reads `draft.md`, turns the relevant entries into a dated retro doc, and prunes what was consumed.

This pattern exists because dated retros were being written at the end of every session — cluttering the directory and making it hard to see what actually needed attention.

## Purpose

Make the repo learn from itself. Observations → decisions → actions → deferred. The queue keeps signal from getting lost between retros; the retro turns signal into decisions.

## Mode 1 — Logging to `draft.md`

**When to add an entry:**

- At the end of any session where something felt rough, surprising, or worth remembering. (Replaces the old "end a session by writing a retro.")
- When Max asks you to note something for a future retro.
- Any time you're acting as a **coordinator agent** (you're the session driver, delegating to subagents or running the flow) — always skim whether something belongs in `draft.md` before wrapping up. Coordinators see the friction; subagents usually don't.
- Mid-session, when a moment of friction would be lost by the end.

**What to add:**

One line per entry. Date prefix, terse phrasing, enough context that it's readable a week later without the conversation. Link to commits, PRs, files. Examples:

```markdown
- 2026-04-19 — worktree first-run had to copy `.dev.vars` manually; `.worktreeinclude` didn't pick it up. Worth a proper fix.
- 2026-04-19 — `bun install --filter` flag shape surprised me; doc drift in root CLAUDE.md? (see d3f84c)
- 2026-04-19 — agent spawned for "parallel feature" landed in `Agent isolation=worktree`, which denies `Write`. Confusion pattern worth capturing.
```

**Do not** write the full Observations/Decisions/Actions structure in `draft.md`. That's for the retro itself. `draft.md` is pre-decision signal — it's OK if an entry turns out to be nothing.

**Pruning:** `draft.md` is append-only during a session. Pruning happens as part of running a retro (Mode 2), not opportunistically.

## Mode 2 — Running a retro

**Retros only happen when Max initiates one.** Do not start a retro because the session "felt meaningful" — add to `draft.md` instead. When Max says "let's run a retro" (or similar), then:

1. **Read `draft.md`.** These are the candidate topics.
2. **Gather fresh signal.** `git log --oneline -20`; skim the last 2–3 dated retros for carryover.
3. **Sweep for hygiene drift.** Check the two debt registers for entries that have aged out — each one that can be removed is a candidate decision for this retro:
   - **[`osv-scanner.toml`](../../osv-scanner.toml)** — for every `[[IgnoredVulns]]` entry: has `ignoreUntil` passed? Has the upstream fix shipped (check the advisory URL and the affected package's latest version via `bun pm view <pkg> version` or the advisory page)? Is the original justification still true (e.g., "drizzle-kit is devDependency-only" — confirm it still is)? If any answer has changed, the entry can likely be removed or the dep bumped.
   - **[`bunfig.toml`](../../bunfig.toml)** `minimumReleaseAgeExcludes` — for every package on the excludes list: is the currently-locked version older than 7 days? (`bun pm view <pkg> time` shows publish dates; compare against `bun pm ls <pkg>`.) If the locked version has aged out of the quarantine window, the package can come off the excludes list. The comment in `bunfig.toml` makes this explicit: "Trim this list once the locked version ages out."
4. **Ask Max** which threads from `draft.md` (and the hygiene sweep) to pull on. 3–5 targeted questions, not a survey.
5. **Propose a timebox** — a small ordered list of what this retro will produce this session. Confirm before editing.
6. **Make the changes** the retro calls for (doc updates, backlog entries, ADRs, `osv-scanner.toml` / `bunfig.toml` edits).
7. **Log the retro** at `docs/retros/YYYY-MM-DD-<slug>.md` using the [template](#template). Slug: 2–4 kebab-case words describing the theme.
8. **Prune `draft.md`.** Remove entries that were addressed (either rolled into the retro or explicitly dropped). Leave anything still open for the next retro.

## Style

- **Short.** A retro should read in ~2 minutes. Longer = design doc in disguise.
- **Observations before decisions.** "I noticed X" before "we decided Y."
- **Action-biased.** An observation that leads to neither a change nor a deferred item isn't worth logging.
- **Link, don't inline.** Point to ADRs, SPEC sections, specific files/lines.
- **No trailing summaries.** Headers and bullets should be scannable on their own.

## Template

```markdown
---
date: YYYY-MM-DD
slug: short-theme
---

# Retro — <theme>

## Context
One or two sentences on what the session was about.

## Observations
- …

## Decisions
- …

## Actions taken
- …

## Deferred
- … (and where it landed — a backlog item, the next `now.md`, a follow-up retro, a new ADR)
```

## Relation to other docs

| Doc | Role |
|---|---|
| [`docs/retros/draft.md`](draft.md) | Running queue of retro-worthy observations (append during sessions, prune during retros) |
| `docs/retros/YYYY-MM-DD-*.md` | Dated retros — only created when Max initiates one |
| [`docs/product/now.md`](../product/now.md) | Ordered current-sprint tasks |
| [`docs/product/backlog.md`](../product/backlog.md) | Unresolved questions |
| [`docs/decisions/`](../decisions/) | Why a specific decision was made |

If a retro observation resolves into a decision substantial enough to re-litigate later, write an ADR. The retro is the spark; the ADR is the durable record.

## What NOT to log (anywhere in `docs/retros/`)

- Bug-fix churn (commit messages cover this).
- Architectural decisions — those are ADRs.
- Todo lists — those are `now.md`.
- Long narrative. If you need more than 2 minutes, you're probably writing a spike or an ADR.

## Common mistakes

- **Writing a dated retro at end-of-session without being asked.** Add to `draft.md` instead. Wait for Max.
- **Writing an essay in `draft.md`.** One line. The retro is where the essay (if any) goes.
- **Forgetting to prune `draft.md` after running a retro.** Entries that were addressed should come out; everything else stays for next time.
