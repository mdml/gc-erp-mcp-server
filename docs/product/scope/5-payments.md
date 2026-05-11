# Scope 5 — Payments

**Why 5:** Understood; the last major thing. Pay applications (G702/G703 PDFs), sub payments, retainage, lien waivers, billed-vs-paid. The shape of this work is well-known from construction practice — this is the scope that's most "implement what's standard," not "decide what to build." It lands last because it builds on [scope 1 (client ledger)](1-client-ledger.md) for the receivable side and [scope 4 (sub onboarding)](4-sub-onboarding.md) for the lien-waiver external-party flow.

## What this scope is

Close the money loop. Generate pay applications from the cost + commitment ledger; track sub payments and retainage; tie lien-waiver workflow to payment release. Operator visibility into "what was bid → what was committed → what was done → what got paid → what's still outstanding" — end-to-end, both directions.

This is the M5/M6-shaped work from the old milestone plan: legal-artifact generation (G702/G703) plus running a real job for the first time. Once this lands, v1 is feature-complete.

## In

- **Schema.**
  - `PayApplication` — numbered (per-job sequence), state (drafted, submitted, approved, paid), period covered, line items (one per scope or activation, with billed amount, % complete, retainage)
  - `Payment` — append-only event, references either a Cost (sub payment) or a PayApplication (client payment), date, method, reference number
  - `Retainage` — per-Commitment default, overridable per-PayApplication-line, accrued vs released
  - `LienWaiver` — per-Commitment + per-PayApplication, waiver type (conditional / unconditional, partial / final), state (requested, received, on-file), document reference
- **Tools.** `generate_pay_app`, `submit_pay_app`, `record_pay_app_approval`, `record_payment`, `request_lien_waiver`, `record_lien_waiver`, `release_retainage`, etc.
- **Pay-app PDF generation.** G702 (summary) + G703 (continuation sheet, line-item detail). Server-side rendering; output to Tigris (or whatever blob store ships with [scope 0](0-foundation.md)'s post-pivot stack).
- **Lien-waiver workflow.** Reuses [scope 4](4-sub-onboarding.md)'s external-party UX path. Request goes to sub via the chosen channel (custom form / DocuSign / email); response comes back as a document reference; operator attests via MCP app.
- **Billed vs paid reconciliation.** "What did we bill the client this period vs what did they pay?" reporting. Same shape downstream: "what did we owe Rogelio vs what we paid him."
- **Real-job dogfood.** The M6-shaped goal — use this on one of our actual projects, end to end. Fix what breaks. Closes v1.

## Out

- **Tax forms (1099-NEC, etc.).** Not in v1; QuickBooks handles.
- **Insurance claim handling.** Out.
- **Multi-currency.** USD only.
- **Auto-payment / ACH integration.** Operator marks payments as made; system doesn't initiate transfers.
- **Pay-app collaboration / multi-party review workflows.** Operator drafts and submits; client approves out-of-band; we record approval. No in-system back-and-forth.
- **Cost-code-level pay-app rendering** (CSI-coded line items beyond the existing scope-tree shape). The G703 renders one line per scope; if CSI codes ever land (`backlog.md` — scope taxonomy), the rendering can extend, but not v1.

## Open questions

- **% complete on pay apps.** Three plausible drivers (decided in [scope 3](3-schedule-deps.md), consumed here): (a) operator-reported per activation, (b) cost-to-committed ratio, (c) activation state (NTP'd=10%, started=50%, finished=100%). Likely (a) with (b) as an AI-suggested default. Cross-reference scope 3 once the scope-3 decision lands.
- **Retainage shape.** Three forks: per-Commitment field with PayApplication-line override, per-PayApplication-line only, or per-job default. Lean per-Commitment-with-override (matches how subs typically negotiate retainage as part of their contract).
- **Approvals schema.** Lien waivers, NTP issuance, change-order approval, pay-app approval — all have a similar "operator (or external party) attests" shape. One generic `Approval` entity vs per-domain (`LienWaiver`, `PayApplicationApproval`, etc.). Lean per-domain for clarity; revisit if the duplication gets painful.
- **PDF rendering library.** Rust ecosystem options for PDF generation (e.g. `printpdf`, `pdfium-render`, headless Chromium via `chromiumoxide`) — pick one at implementation time. Likely a focused stack ADR. Lean toward HTML→PDF via headless Chromium for fidelity vs. native Rust for simplicity; trade depends on how G702/G703 fidelity-sensitive the client is.
- **Pay-app numbering scope.** Per-job (Job #1, #2, #3) or per-project (Project #1, #2 spans jobs)? Industry convention is per-application-against-a-contract, which usually means per-job in our shape, but if [scope 1](1-client-ledger.md) lands project-level client contracts, this gets interesting.
- **Direct costs in pay apps.** Self-commitments (created by `record_direct_cost`) have rollup semantics in flux per [scope 1](1-client-ledger.md). Decide here: do they show on the G703 as their own lines? Roll into the parent scope? Get suppressed entirely?

## Engineering plan

Depends on [scope 0](0-foundation.md), [scope 1](1-client-ledger.md) (client-side ledger required for pay apps), [scope 4](4-sub-onboarding.md) (external-party UX for lien waivers). Can start the schema work in parallel with scope 4 once scope 1 lands.

1. **Schema.** `PayApplication`, `Payment`, `Retainage`, `LienWaiver`. Fold in the % complete shape from scope 3.
2. **Tools.** Pay-app draft / submit / approve / record-payment; lien-waiver request / record; retainage release.
3. **PDF generation ADR.** Rust PDF stack choice. Probably a focused ADR or a small `docs/guides/rust-pdf.md` per the new-vendor convention.
4. **G702/G703 rendering.** Implementation; sample output reviewed for fidelity.
5. **Lien-waiver flow.** Wire [scope 4](4-sub-onboarding.md)'s external-party UX path to lien-waiver request/response.
6. **Real-job dogfood.** Run it on an actual project. Pause work; log issues; resume per the [`docs/dogfood/CLAUDE.md`](../../dogfood/CLAUDE.md) flow. Fix what breaks. Closes v1.

## Connects to

- [scope 1 — Client-side ledger](1-client-ledger.md) — pay apps are the operational artifact of the client side
- [scope 3 — Schedule dependencies](3-schedule-deps.md) — % complete shape decided there, consumed here
- [scope 4 — Subcontractor onboarding](4-sub-onboarding.md) — lien-waiver flow reuses the external-party UX path
- [`backlog.md`](../backlog.md) — `parentPatchId` requirement (every pay-app revision is a derivation, exercises this); scope taxonomy (CSI codes for pay-app line rendering)
- [SPEC.md §1](../../../SPEC.md) — schema extension lands here
