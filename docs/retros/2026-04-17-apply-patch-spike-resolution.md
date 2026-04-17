---
date: 2026-04-17
slug: apply-patch-spike-resolution
---

# Retro — first full spike → ADR run

## Context

Resolved `docs/spikes/apply-patch-shape.md` end-to-end: 23 forks enumerated, four load-bearing ones landed as [ADRs 0005–0008](../decisions/), minor ones absorbed as inline JSDoc / code tightenings, spike file deleted. M2 commitment+NTP tool implementation is now unblocked.

## Observations

- **The spike-to-ADR lifecycle worked as written.** [`docs/CLAUDE.md`](../CLAUDE.md) + [`docs/decisions/CLAUDE.md`](../decisions/CLAUDE.md) prescribed it; this session was the first end-to-end run. The split between "load-bearing → ADR" and "minor → inline JSDoc" matched the spike's own judgment calls, so no re-litigation was needed.
- **Reset-hard ate an unpushed commit.** Suggested `git reset --hard origin/main` to a human-on-main with the claim "the only local-only commit is 7a88ed2 which is already present on origin inside the squashed merges, so nothing's lost." That claim was wrong — the spike commit had never been pushed. Recovered from reflog, cost ~5 minutes. Would-have-cost hours if reflog had been pruned.
- **F4.3 stance changed during review, not from the spike.** The spike defaulted to "keep `siteReady` as documentary." Max's pushback — "but what about notice of delay, site-block on arrival, rain?" — reframed the gap as "the post-NTP delay concept is missing entirely," which resolved via a future `DelayEvent` and dropped `siteReady` cleanly. A pattern worth naming: **a documentary boolean in an event log is usually a symptom of a missing structured event**. Watch for that at spike-authoring time.
- **Cherry-picking a partially-conflicting recovered commit is noisy.** The spike commit also bumped `now.md`, which conflicted with PR #11's `now.md` edits on the merged base. Aborted the cherry-pick, extracted only the spike file via `git show <sha>:<path>`, re-committed, and updated `now.md` fresh at PR close. Cleaner than conflict-resolving the cherry-pick.
- **Commit granularity exercised judgment, not a rule.** Four commits on top of the spike-recovery: ADRs+SPEC+TOOLS together; all database code together; closeout. "One per ADR" would have meant split-staging `SPEC.md` across four commits, which git doesn't cleanly support. The prompt's "use judgment" clause was load-bearing.

## Decisions

- None new beyond the four ADRs already active. Session was pure execution of decided work + one stance-shift (F4.3) already captured in [ADR 0007](../decisions/0007-ntp-derivation-from-current-activation.md).

## Actions taken

- ADRs [0005](../decisions/0005-activations-carry-scopeid.md) – [0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md) landed.
- Migration [`0001_white_steel_serpent.sql`](../../packages/database/src/migrations/0001_white_steel_serpent.sql) — add `activations.scope_id`, drop `ntp_events.site_ready`.
- [`invariants/commitments.ts`](../../packages/database/src/invariants/commitments.ts): new `assertActivationScopesInCommitment`; structured error details; post-fold doc.
- [`patches/hash.ts`](../../packages/database/src/patches/hash.ts): `jobId` in canonical payload (F2.1); test lock for `{signedOn: undefined}` ≡ `{}` equivalence (F2.5).
- [`schema/patches.ts`](../../packages/database/src/schema/patches.ts): `setActivation.fields` omits `activityId` (F1.1 tightening).
- New backlog entry: [`Schedule event log — DelayEvent + activation closure`](../product/backlog.md) absorbs F4.3 revised stance, F4.4, and the rain/site-block scenario.
- [`now.md`](../product/now.md) flipped: Up next = `apply_patch` + `issue_ntp` + `get_scope_tree` → Day 3/10 in `kitchen.ts`.
- Spike file deleted; reasoning moved into ADRs.

## Deferred

- **`DelayEvent` + activation closure** → [backlog.md](../product/backlog.md) item. Lands with M3+ schedule / pay-app work.
- **F3.2 projection-vs-log parity check** → scenario-runner assertion per [ADR 0008](../decisions/0008-apply-patch-atomicity-via-d1-batch.md). Lands with Day 60 change-order scenario.
- **F1.6 operator PartyId for `record_direct_cost`** → decide when that tool lands (M2 Day 18).
- **F5.4 / F5.5 / F5.6 rollup details** → inline JSDoc on `get_scope_tree` when that tool lands.
- **Reset-hard guardrail** → unwritten but worth a small change: before suggesting `git reset --hard origin/<branch>`, verify with `git log origin/<branch> --contains <local-sha>` that the local commit is actually reachable from the remote. Candidate for the root CLAUDE.md git section on next pass.
