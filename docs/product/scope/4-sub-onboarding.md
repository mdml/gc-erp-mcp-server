# Scope 4 — Subcontractor onboarding / qualification

**Why 4:** Unlocks the second-biggest open questions on UI. Sub vetting requires getting paperwork from people who don't have Claude Desktop — COI, W9, master subcontract, references, insurance verification. That forces two cross-cutting design questions: **external-party UX** (how do subs send us things?) and **integration ownership** (do we host APIs that Gmail / DocuSign call into, or does Claude orchestrate the pieces from outside?). Both questions ripple into [scope 2 (bidding)](2-bidding.md) and [scope 5 (lien waivers)](5-payments.md), so deciding them here pays back across the rest of the v1 plan.

## What this scope is

Sub vetting and qualification as first-class. Today `Party` exists with `name` / `email` / etc., but there's no qualification state — anyone in the table can be issued a Commitment. Add: COI tracking with expiry, W9 status, master-subcontract execution, qualification status (per-sub, per-job, or both), expiry alerting. Then build the operator workflow (review docs, approve, re-qualify) and decide the external-party path for sub-submitted documents.

This is the scope where a "subs portal" question would land if we were going to build one. Per the v1 out-of-scope list ([scope/README.md](README.md#out-of-scope-foreverish)), we're not — but the integration and forms work here is what would seed one.

## In

- **Schema.** Sub qualification state on `Party` (or new `Subcontractor` entity if the qualification surface gets large enough to warrant it). At minimum:
  - COI document with carrier, policy number, coverage limits, effective dates, expiry
  - W9 status (collected, on-file, year)
  - Master subcontract execution (signed-on, expiry, version)
  - Qualification status: an explicit state field (e.g. `qualified | pending | expired | suspended`)
- **Tools.** `record_coi`, `record_w9`, `record_master_sub`, `qualify_sub`, `expire_sub`, `list_qualified_subs`, etc. Naming TBD.
- **Expiry handling.** COIs expire annually; that's a real workflow event (alert operator at T-30, T-7; block new commitments past expiry?). Decide enforcement vs warning.
- **External-party document intake.** The cross-cutting decision (see Open questions). Whatever shape — custom forms, email-parse, integrate-existing (Notion / Google Forms / DocuSign) — gets implemented for *this* scope first because it's the highest-volume external-party flow.
- **Operator review UX.** Likely an MCP app (attestation-shaped — operator clicks "approve" / "reject"), with a read-only summary view (web or MCP-app, depends on the scope-3 schedule UI ADR's outcome).
- **Qualification gating on Commitments.** When a Commitment is created (or a Bid awarded — see [scope 2](2-bidding.md)), check that the counterparty is qualified. Hard-block or soft-warn? Decide.

## Out

- **Subs portal** (full self-service web app for subs). Already in [scope/README.md](README.md#out-of-scope-foreverish) out-list. The forms / intake work here might *seed* something portal-shaped later, but a real portal isn't v1.
- **Lien waivers.** [Scope 5](5-payments.md). Lien waivers reuse the external-party UX pattern this scope establishes.
- **Bid solicitation.** [Scope 2](2-bidding.md). Same external-party UX consideration; pick one canonical path here, scope 2 follows.
- **Sub performance scoring / ratings.** Future. v1 tracks qualification status only, not performance.
- **Insurance carrier integration.** No COI auto-pull from Travelers / Hartford / etc.; operator-keyed (or sub-emailed PDF) only.
- **Background checks.** Not in scope.

## Open questions

- **External-party UX.** The headline cross-cutting decision. Three forks:
  - **Build-custom-forms** — lightweight web app served by the same Rust binary; sub gets a one-off URL, fills a form, doc lands in our system. High control, full integration, modest build cost.
  - **Integrate-existing** — Notion DBs, Google Forms, DocuSign. Lower build cost; sub UX more familiar; we own less of the workflow.
  - **Email-only degenerate** — sub emails a PDF; LLM (or operator) parses + records. Cheapest; weakest auditability and structure.
  - Decision matters here, but answer also drives [scope 2](2-bidding.md) bid intake and [scope 5](5-payments.md) lien-waiver flow. Needs ADR before implementation; lean: hybrid (build-custom-forms for high-structure things like COI metadata, integrate-existing for legal docs we want signed on DocuSign).
- **Integration ownership.** Us-as-integrator (we host the APIs, status webhooks come to us; predictable, auditable; we maintain integrations) vs Claude-as-orchestrator (we expose data + verbs; Claude stitches Gmail + DocuSign + our MCP from outside; flexible, no API-maintenance cost; less auditable). MCP-first ethos leans orchestration, but audit-critical flows (COI verification, master-subcontract execution) lean us-as-integrator. Decide here, with scope 5 (lien waivers) as the second use case.
- **Qualification per-sub vs per-job.** A sub can be generally qualified but unqualified for a specific job (e.g. lacks the required insurance limit for a high-value job). Adds a per-job qualification override layer, or kept simple as global only?
- **Hard-block vs soft-warn on commitment-to-unqualified-sub.** Enforce qualification at the tool layer (reject `apply_patch` that creates a Commitment with an unqualified counterparty), or warn the operator + log it. Lean soft-warn to start; can tighten if it's abused.
- **Agent topology for COI expiry alerts.** Cross-cutting (`backlog.md` — agent topology). Scheduled-skill ("cron checks expiring COIs every Monday, drafts a reminder email") vs on-demand (operator asks "what's expiring?"). Scheduled is the right shape; this scope forces the decision.

## Engineering plan

Depends on [scope 0](0-foundation.md) being fully landed. The external-party UX ADR is the gating decision; don't start schema work until that ADR lands, since the data shape varies meaningfully across the three external-party paths.

1. **ADR for external-party UX.** Three-way fork; canonical decision used here, [scope 2](2-bidding.md), [scope 5](5-payments.md). Likely a hybrid (custom forms + DocuSign-style integrate-existing).
2. **ADR for integration ownership.** Adjacent decision; lands together with the external-party UX one or right after.
3. **Schema.** Qualification state, COI / W9 / master-sub document references, expiry fields.
4. **External-party tooling.** Whatever the ADR landed on — forms server, email-parse pipeline, third-party integrations.
5. **Operator review MCP app.** Attestation-shaped (approve / reject); pulls from the document-intake pipeline.
6. **Scheduled expiry alerting.** Forces the agent-topology question for "scheduled skills" — first canonical example in this codebase.

## Connects to

- [scope 2 — Bidding](2-bidding.md) — qualification gating bids; external-party UX shared
- [scope 5 — Payments](5-payments.md) — lien-waiver flow reuses external-party UX
- [`backlog.md` — Cross-cutting design](../backlog.md) — external-party UX, integration ownership, agent topology — all forced here
- [SPEC.md §1](../../../SPEC.md) — `Party` schema extension (or new `Subcontractor` entity)
