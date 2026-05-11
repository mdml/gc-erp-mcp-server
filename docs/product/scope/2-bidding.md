# Scope 2 — Bidding

**Why 2:** Never figured this out. Bidding is a real workflow that's currently invisible to the system. `Commitment` has a `signedOn` date but no representation of "pending bid," "competing bids on the same scope," or "bid declined." Today the entire pre-award process happens out-of-system; commitments arrive as already-signed contracts. This scope decides how bidding fits into the data model, which has downstream consequences for everything (every Commitment has a "where did this come from?" upstream story).

## What this scope is

Pre-signed contract tracking. Add the bid lifecycle — bid request → bids received → bid awarded → commitment created — as first-class entities, with the relationships needed to answer "what did we ask?", "who bid?", "why did we pick X?", and "what's still pending?". This scope intentionally precedes [scope 4 (Subcontractor onboarding)](4-sub-onboarding.md) only in the sense that the *data model* lands; the *workflow* (sub-submitted bids vs operator-keyed bids) blends with scope 4's external-party UX decision.

## In

- **Bid lifecycle entity model.** Decision needed (see Open questions): one of
  - **Path A** — `Bid` as a separate entity that becomes `Commitment` on award (preserves bid history; commitments stay "what was signed")
  - **Path B** — `Commitment.state: bid | signed | void`; one entity, lifecycle field
  - **Path C** — Out-of-system bid tracking with thin "import on award" path (probably rejected — loses too much auditability)
- **Tools.** Create / record / award bids, attach scope refs, decline bids, query "what's outstanding."
- **Bid solicitation flow.** How does a bid request get to a sub? Three sub-paths overlap with scope 4's external-party UX decision: email a request and parse the reply, give subs a custom form, or operator-keyed (we type in their bid). Pick a primary path; others can land later.
- **Bid comparison.** When multiple subs bid the same scope, the operator wants a side-by-side view. Decide whether this is an MCP-app (attestation-shaped — the click "awards" the bid) or a read-only web view (scanning-shaped). Cross-cuts the operator UX split (`backlog.md`).
- **Award provenance on Commitment.** When a Commitment is created from an awarded Bid, the Commitment carries a reference back. Useful for "we picked Rogelio at $9,500 over Acme at $10,200 because [reason]" reporting.

## Out

- **Multi-round bidding (counter-offers, BAFO).** Defer to v2 if it shows up; v1 assumes a single round per scope.
- **Sub qualification gating bids.** Belongs in [scope 4](4-sub-onboarding.md). This scope assumes "anyone in the Party table can bid"; scope 4 may add a "qualified-to-bid" check on top.
- **Public bid posting / open RFQ.** Out — we hand-pick subs.
- **Bid evaluation scoring rubrics.** Operator picks; this scope doesn't model multi-criteria scoring.
- **Lien-waiver-shaped pre-award docs.** Belongs in [scope 4](4-sub-onboarding.md) (qualification) or [scope 5](5-payments.md) (lien waivers proper).

## Open questions

- **Bid entity shape: Path A vs Path B vs Path C.** Needs an ADR. Path A (separate `Bid` entity) keeps the model honest about lifecycle but doubles the entity surface for what's basically a state transition. Path B (lifecycle field on Commitment) is minimal but leaves "Commitment" with a less precise meaning. Path C (out-of-system) loses auditability but is the cheapest if bidding turns out to be operationally informal.
- **How bids enter the system.** Operator-keyed (we type) vs sub-submitted (a form, email, or portal) vs email-parsed (LLM reads inbox and structures). Depends on scope 4's external-party UX decision.
- **Bid comparison UI shape.** MCP app (attestation-shaped, "click awards") vs read-only web view (scanning-shaped) vs both. Cross-cuts the operator UX split decision in `backlog.md`. Forced here, but the same tension shows up in scope 3 and scope 5.
- **Award without explicit bid.** Many real situations are "I called Rogelio, he said $8500, I said yes" — no formal bid. Does the system require a `Bid` row, or can a `Commitment` be created directly with no bid history? If yes, the bid lifecycle is genuinely optional and Path B starts looking better.

## Engineering plan

Depends on [scope 0](0-foundation.md) being fully landed. Loosely depends on [scope 4](4-sub-onboarding.md) for the external-party UX decision; can land first if bid intake stays operator-keyed.

1. **ADR for bid entity shape.** Path A vs B vs C. Discussion + decision; no POC needed (modeling, not vendor unknown).
2. **Schema + state machine.** Implement chosen shape. Rust sum types make Path B's lifecycle field naturally exhaustive.
3. **Tools.** Create / record / award / decline / query.
4. **Bid intake flow.** Whatever the chosen primary path is (operator-keyed minimum; sub-submitted or email-parsed if scope 4's decision aligns).
5. **Bid comparison UI.** Whichever shape (MCP app or web view) the cross-cutting decision lands on.

## Connects to

- [scope 1 — Client-side ledger](1-client-ledger.md) — Commitment shape extends here too; the Path A/B decision lives upstream of the receivable-side modeling
- [scope 4 — Subcontractor onboarding](4-sub-onboarding.md) — qualification gating bids; external-party UX shared
- [`backlog.md` — Cross-cutting design](../backlog.md) — operator UX split (MCP apps vs web app); external-party UX
- [SPEC.md §1](../../../SPEC.md) — Commitment shape that bidding extends or splits
