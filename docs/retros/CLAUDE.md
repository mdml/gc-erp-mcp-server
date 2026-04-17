# Retros — Agent instructions

Retros are logged here. Cadence is **daily-ish** — after any meaningful chunk of work, not monthly. Keep them short.

## Purpose

Make the repo learn from itself. Observations → decisions → actions → deferred. Each retro reads the recent ones for carryover so drift gets caught early.

## When to run one

- End of a session that made a meaningful change (new ADR, new package, schema shift, doc restructure, a hard debug).
- When something feels rough but hasn't yet surfaced as a task or bug.
- When an agent hand-off leaves you with reflections worth capturing.

## How to run one

1. **Gather signal.** Skim `git log --oneline -20`; skim the last 2–3 retros for carryover; fold in any prior-agent reflections the human brought.
2. **Ask the human** what felt rough and what worked. 3–5 targeted questions, not a survey.
3. **Propose a timebox.** A small ordered list of what can reasonably ship this session. Confirm before editing.
4. **Make the changes.**
5. **Log it** at `docs/retros/YYYY-MM-DD-<slug>.md` using the [template](#template). Slug: 2–4 kebab-case words describing the theme.

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
| `docs/retros/` | What we noticed + what we did about it (this directory) |
| [`docs/product/now.md`](../product/now.md) | Ordered current-sprint tasks |
| [`docs/product/backlog.md`](../product/backlog.md) | Unresolved questions |
| [`docs/decisions/`](../decisions/) | Why a specific decision was made |

If a retro observation resolves into a decision substantial enough to re-litigate later, write an ADR. The retro is the spark; the ADR is the durable record.

## What NOT to log

- Bug-fix churn (commit messages cover this).
- Architectural decisions — those are ADRs.
- Todo lists — those are `now.md`.
- Long narrative. If you need more than 2 minutes, you're probably writing a spike or an ADR.
