# Dogfood — Agent instructions

Docs under `docs/dogfood/` are the **pause-era testing log**. Written during periods when development is deliberately paused and the focus is on *using* the deployed product to build intuition — not shipping code.

> **Mode: product observation, not engineering.** Agents in this directory are Max's thinking partners for the product. Answer questions, look up behavior in the code or against prod, help reason through what's working and what isn't. But **do not commit code changes** during a pause — bugs and ideas get logged, not fixed. Fixes resume when Max ends the pause.

## Files

| File | Contains | Update cadence |
|---|---|---|
| [testing-log.md](testing-log.md) | Dated, append-only dogfood notes — the raw signal | Every dogfood session |

## Operating modes

### Mode 1 — Logging (during the pause)

**When Max says "log this: X" (or similar),** append to [testing-log.md](testing-log.md) under today's date heading. Create the date heading if it doesn't exist yet.

Entries can be **freeform bullets** (fastest — Max dumps a thought, agent captures verbatim) or **categorized** under four subsections:

- **What I did** — the action that surfaced the observation (e.g., "Opened cost-entry form via Claude Desktop from a chat about kitchen framing")
- **What surprised me** — friction, unexpected behavior, "huh that's weird" (→ Mode 2 routes these to [`docs/retros/draft.md`](../retros/draft.md))
- **Questions / ideas** — product questions, schema forks, feature ideas (→ Mode 2 routes these to [`docs/product/backlog.md`](../product/backlog.md))
- **Next-session tasks** — concrete todos for when dev resumes (→ Mode 2 routes these to [`docs/product/now.md`](../product/now.md))

**Prefer freeform when in doubt.** If a thought doesn't obviously fit a bucket, log it raw. Over-categorizing slows capture; under-categorizing is easy to fix in triage.

**Answer questions while logging.** If Max asks "why does X work like that?" or "where's Y in the code?" — answer directly. Look up code, read docs, probe prod (`curl https://gc.leiserson.me/...`). If the answer changes or sharpens the observation, log both.

**No code commits.** If Max notices a bug, log it as a "What surprised me" entry. Don't offer to fix it. If he asks you to fix it, push back — route it to `next-session tasks` and resume code work when the pause ends. The exception: trivial typo fixes in the log itself.

**Commits on this branch are `docs(dogfood):` prefix.** Batch at end-of-session, not per-entry. The branch merges back to `main` via PR when the pause ends.

### Mode 2 — Triage (Max initiates)

**When Max says "triage the log" (or similar),** walk the testing-log entries and route each to its permanent home:

1. **Read [testing-log.md](testing-log.md)** start to finish for the session(s) being triaged.
2. **Categorize any freeform entries** — ask Max if genuinely ambiguous. Don't guess and silently route.
3. **Route each entry to exactly one home:**
   - Surprises → one-liner in [`docs/retros/draft.md`](../retros/draft.md), date-prefixed, per [retros/CLAUDE.md](../retros/CLAUDE.md) style.
   - Questions / ideas → [`docs/product/backlog.md`](../product/backlog.md) under the right section (Data model, Runtime/MCP, Product wedge, etc.). Brief leanings OK; don't decide — that's an ADR.
   - Next-session tasks → [`docs/product/now.md`](../product/now.md) under "Up next", ordered.
4. **Mark the triaged date** by adding `*(triaged YYYY-MM-DD — routed to backlog/retros/now)*` under the date heading, so future passes skip it.
5. **Leave log entries in place.** The log is append-only history; triage is distillation, not deletion.

One-write-one-home is the invariant: every raw observation ends up in exactly one permanent file. If a single entry seems to warrant two homes (e.g., a surprise that's also a task), split it into two permanent entries — don't duplicate.

## When to end the pause

Max calls it. When he does, the usual pre-session rhythm applies (see root [CLAUDE.md](../../CLAUDE.md) "Session rhythm"): read `now.md`, last 1–2 retros, `git log`. The dogfood branch merges back into main via a normal PR, usually bundled with any triage-pass doc updates.

## What NOT to do

- **Don't commit code changes.** Bugs go in the log. Fixes wait.
- **Don't write dated retros.** That's `draft.md` plus a future Max-initiated retro ([retros/CLAUDE.md](../retros/CLAUDE.md)).
- **Don't duplicate entries** into backlog/retros/now during logging — that's triage's job. One write, one home.
- **Don't create sub-files under `docs/dogfood/`** without a reason. If a theme warrants its own doc (design note, vendor guide), it probably belongs in `docs/guides/` or as an ADR, not here.
- **Don't prune the log.** Append-only. Even after triage, entries stay.

## Relation to other docs

| Doc | Role |
|---|---|
| [testing-log.md](testing-log.md) | Raw dogfood signal (this dir) |
| [`docs/retros/draft.md`](../retros/draft.md) | Triaged surprises — queue for future retros |
| [`docs/product/backlog.md`](../product/backlog.md) | Triaged questions/ideas — single home for open product questions |
| [`docs/product/now.md`](../product/now.md) | Triaged next-session tasks |
| [`docs/guides/`](../guides/) | Current-state guides — stable, not session notes |
