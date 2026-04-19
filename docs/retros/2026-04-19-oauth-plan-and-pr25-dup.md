---
date: 2026-04-19
slug: oauth-plan-and-pr25-dup
---

# Retro — OAuth plan landed; PR #25 duplicate caught late

## Context

Session started with two in-flight worktree PRs both targeting `feat/dogfood-prep`: #25 (install:mcp:local bug + platform guard) and #26 (OAuth planning docs). Goal was to review both, merge, close out `feat/dogfood-prep`. Ended with #26 merged, #25 closed as duplicate, and the novel bits from #25 ported as [PR #27](https://github.com/mdml/gc-erp-mcp-server/pull/27).

## Observations

- **PR #25's worktree branched from `c435b0c`, ~17 commits behind current `feat/dogfood-prep` (652a9de).** Per [root CLAUDE.md](../../CLAUDE.md) "`claude --worktree` branches from `origin/HEAD`, not your current local branch" — confirmed in the wild. The agent never saw `packages/dev-tools/src/install-mcp/` (shipped in `bf041d6`, `afd9f7d`, `92f9fc5` from a prior session) and rebuilt it as a parallel `install-mcp.ts`. Max's "I checked, it works" verified PR #25's *own* branch, not that it'd merge.
- **The duplicate wasn't caught at first review.** Reviewed content as written, asked for one nit (platform guard), agent added it — only discovered the duplicate when the actual merge conflicted. A `git merge-base <pr-branch> <target-branch>` against the target-branch tip would've surfaced the staleness before the content review and saved the round-trip.
- **PR #26 (CLEAN, merge-base 652a9de) vs. PR #25 (DIRTY, merge-base c435b0c) was visible in `gh pr view --json mergeable,mergeStateStatus` from the start.** Had I checked mergeStateStatus *before* the first content review, the duplicate risk would've shown up 30 minutes earlier.
- **PR #26 also had a base-staleness symptom** — the `type: "http"` regression. The agent couldn't see PR #25's docs correction (which was still in a worktree, not merged) and rewrote the prod config block in the stdio-incompatible native form. That one got caught inline; the fix prompt handoff worked cleanly.
- **Docs-ahead-of-code on a feature branch is fine; on `main` it's an invariant violation.** PR #26 wrote ARCHITECTURE.md + CLAUDE.md as if Stytch were live. That's acceptable on `feat/dogfood-prep` because the OAuth coding slice is planned next on the same branch — the whole thing lands at `main` together. The "ARCHITECTURE.md reflects current state, not aspiration" rule is a `main` invariant, not a branch-state invariant.

## Decisions

- **`feat/dogfood-prep → main` gated on the OAuth coding slice landing first** — per `now.md` #1 → #2 ordering. Docs-ahead-of-code is load-bearing: merging sooner would put lying architecture docs on `main`.
- **PR #25 closed, not rebased.** Rebasing would've required deleting most of its content (the duplicate `install-mcp.ts` + test + platform guard + dogfood.md rewrites, all of which already existed on `feat/dogfood-prep`). Cleaner to close and port the ~30-line novel part as [PR #27](https://github.com/mdml/gc-erp-mcp-server/pull/27).
- **`localDevVars` invariant is worth keeping** even though the install-mcp work it originally accompanied got tossed. Before: `bun run sync-secrets` wrote the *prod* `MCP_BEARER_TOKEN` into `.dev.vars`, contradicting dogfood.md's "local bearer is the trivial `dev`" story. After: literals always override resolved values; prod token never leaks to local.

## Actions taken

- Reviewed PR #25 inline (+ re-review after platform-guard update). Max verified working end-to-end.
- Reviewed PR #26 inline; flagged `type: "http"` regression + drafted fix prompt for the PR #26 agent. Re-reviewed after update.
- Closed PR #25 with an explanation comment pointing at the duplicate + forthcoming port.
- Merged PR #26 (rebase, delete branch) → `feat/dogfood-prep` at `1f2395a`.
- Opened PR #27 (`slice/local-dev-vars-split`) porting the `localDevVars` map + `buildDevVarsBody` helper + 5 tests + `.dev.vars.example` alignment.
- Pruned `now.md` (older "Recently done" entries already captured in retros + git log).

## Deferred

- **OAuth coding slice** (`now.md` #1). Spawn a fresh worktree from latest `feat/dogfood-prep` — and verify the merge-base against `origin/feat/dogfood-prep` *before* doing content work, not after conflicts surface. Implementation notes are in [ADR 0010 §"Implementation notes"](../decisions/0010-stytch-oauth-for-prod-mcp.md) — the three open verifications (streamable HTTP vs SSE + Hono vs plain fetch + mcp-remote OAuth end-to-end + email-OTP-only Stytch dashboard setting) need to happen before the slice declares prod green.
- **Worktree base-check as a session-open step.** Surfaced twice this session (PR #25 stale base; PR #26 missed PR #25's correction). Not yet a codified habit. Candidate for addition to the "Session rhythm" in root CLAUDE.md — but deferring until the OAuth slice actually launches via a worktree, since that's the natural next test of the habit.
- **Merge `feat/dogfood-prep → main`** once the OAuth slice lands and claude.ai connects end-to-end (`now.md` #2).
