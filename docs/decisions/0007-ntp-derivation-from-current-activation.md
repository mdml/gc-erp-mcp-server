---
type: ADR
id: "0007"
title: "NTP derivation from current activation state; drop siteReady"
status: active
date: 2026-04-17
spike: "apply-patch-shape"
---

## Context

[SPEC §1](../../SPEC.md) derives an activation's schedule from its latest NTP:

```
startBy  = latestNTP.issuedOn + activation.leadTime
finishBy = startBy            + activation.buildTime
```

Two questions the SPEC didn't answer, and that the spike surfaced (F4.1 and F4.3):

1. **What if `leadTime` / `buildTime` change after NTP is issued?** An activation had `leadTime: 5d` when NTP fired on 2026-04-27. A later `setActivation` patch bumps it to `7d`. Does `startBy` resolve to 2026-05-04 (frozen at NTP time) or 2026-05-06 (recomputed from the current activation)?

2. **What does `siteReady: boolean` on `NTPEvent` mean, and does it earn its keep?** Today the field is purely documentary — operator asserts at issue time. Nothing reads it, no math depends on it. The spike asked whether it should be kept, enforced, or removed.

Max raised a third scenario during spike review that the spike itself didn't directly address: **post-NTP external delays** — rain, site-blocked-on-arrival, owner-caused delay. The schedule moves but no activation field changes. Neither F4.1 (activation edits) nor F4.3 (siteReady at issue time) covers this cleanly.

## Decision

**`startBy` and `finishBy` recompute from the *current* activation state on read. Lead/build time edits after NTP move the schedule; NTP events don't snapshot activation fields.**

**`NTPEvent.siteReady` is dropped from the schema.** The post-NTP-delay scenario is tracked by a future `DelayEvent` (backlog — "Schedule event log: DelayEvent + activation closure"), and a zero-duration `DelayEvent` at issue time covers the "NTP'd but site not ready" case cleanly enough that the boolean doesn't earn its weight.

**The escape hatch for date-freezing is void-and-recreate.** If the operator needs an old NTP to retain the original `startBy`/`finishBy` after an activation edit, the right move is `void` the commitment and create a new one with the desired dates — which preserves the old commitment's history (per [ADR 0006](0006-void-commitment-semantics.md)) while giving the new one clean lead/build times.

## Options considered

### On F4.1 — date semantics after activation edits

- **A. Recompute from current activation (chosen).**
  - *Pros:* activations are the sub's schedule contract; if the contract changes, the schedule moves, which is what the operator and the sub both expect to see on the dashboard; no "two versions of the truth" between NTP row and activation row; keeps NTPEvent as a pure event (issue date + reference) with no denormalized activation data.
  - *Cons:* a patch that extends `buildTime` silently moves `finishBy` for every already-NTP'd activation using that commitment — surprising if the operator doesn't notice. Mitigation: tool-layer surface "this edit will shift schedule for N NTP'd activations" at patch-preview time when tooling matures.
- **B. Freeze at NTP time — snapshot `leadTime` / `buildTime` onto the NTP row.**
  - *Rejected.* Adds denormalized state to every NTP row. Splits "what's my schedule?" between old and new — any view that shows active activations must decide which numbers to use. For pay-app math that cares about original-contract dates, that's better derived from the `patches` table (replay-to-N) than by pre-snapshotting on every NTP.

### On F4.3 — siteReady

- **C. Drop `siteReady` (chosen).**
  - *Pros:* the field is purely documentary today with no read path; post-NTP delays (rain, site-block after the sub arrives, owner-caused slips) need their own event shape (future `DelayEvent`), and a zero-duration DelayEvent at NTP time covers the "issued with a known site issue" case without needing a separate flag. Single event model beats flag + table.
  - *Cons:* between now and when `DelayEvent` lands (M3+ schedule work), the operator can't structurally flag "NTP'd with site issues" — they must use the NTP `note` field prose-style. Acceptable: the kitchen walkthrough doesn't exercise this path, and between dogfood and M3 it's rare enough that prose-in-note is fine.
- **D. Keep `siteReady` as documentary.**
  - *Rejected.* Two places to capture "something was wrong at issue time" (the boolean + the future `DelayEvent`) is worse than one, and we'd have to decide later what `siteReady: false` without a paired `DelayEvent` means — more rules, more edge cases.
- **E. Make `siteReady` enforced — reject NTP issue if false.**
  - *Rejected.* Punishes honesty. Real construction has NTPs issued against imperfect site conditions all the time; making the system refuse means the operator lies or skips the NTP.

## Consequences

**Easier:**

- `NTPEvent` row is leaner: `{ id, activationId, issuedOn, note? }`. Simpler Zod, simpler SQL, simpler derivation.
- Derivation is a single pure function of `activation × latestNTP`: no fallback paths, no "if snapshot then X else Y."
- `DelayEvent` has a clear design target: it absorbs the `siteReady` concept plus the weather / site-block / owner-delay cases in one event type rather than one-off-fields accreting on NTP.

**Harder:**

- `setActivation` edits that change `leadTime` / `buildTime` are load-bearing on schedule. Tool-layer surfacing ("this will shift 3 NTP'd activations") is a good idea when `apply_patch` lands, to match "what the operator expects."
- Callers migrating from `siteReady: true` in existing tests / seeds / scenarios need to drop the field. One-shot migration; no ongoing cost.
- Between M2 and M3, "NTP'd with known issues" has no structured home — operators use `note`. Explicitly deferred; the gap is documented in backlog.md.

**Would trigger re-evaluation:**

- A real operator scenario where the frozen-at-NTP schedule is the right answer (likely a pay-app G702/G703 rule that pays based on "original schedule"). That would be a reporting-layer concern — render from the `patches` table at the pay-app-period snapshot, not a reshaping of NTPEvent.
- `DelayEvent` landing in M3+ with semantics different from what this ADR anticipates. That's a future ADR, not a revision of this one — each schedule-event type is its own decision.

## Advice

Decided in session with Max on 2026-04-17. Spike [`docs/spikes/apply-patch-shape.md`](../spikes/apply-patch-shape.md) F4.1, F4.3. F4.3 stance shifted during review — spike recommended "keep `siteReady` documentary," Max pushed back on the basis that the real gap was external delays, not issue-time flags, and the cleaner model is one event-log concept (`DelayEvent`) covering both. This ADR captures the revised stance. The corresponding backlog entry ("Schedule event log: DelayEvent + activation closure") owns the follow-on work.
