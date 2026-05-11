# Scope

The product is sequenced as five prioritized scopes plus a foundation scope. Each scope is one file in this directory, sized to be read end-to-end. This index lists the scopes with their one-line rationale; for substance, click through.

The five product scopes are ordered: scope 1 ships first, scope 5 ships last. Foundation (scope 0) gates all of them — it has to land before any of 1–5 can ship in the new stack.

## Scopes

- **[0 — Foundation](0-foundation.md).** Rust + axum on Fly.io; Justfile + multi-harness AGENTS.md; sunset `packages/agent-config`. Per [ADR 0017](../../decisions/0017-pivot-mcp-server-to-rust-on-fly.md) (stack pivot) and [ADR 0016](../../decisions/0016-portability-layer-justfile-multi-harness.md) (portability layer). Gates everything below.
- **[1 — Client-side ledger](1-client-ledger.md).** Most important for mental model. Today the data model only captures what we owe subs; without modeling what clients owe us, "passing through with markup" vs "eating a sub cost" is unrepresentable, and pay-app generation has nothing to anchor on.
- **[2 — Bidding](2-bidding.md).** Never figured this out. Pre-signed contract tracking is currently invisible — how a `Commitment` came to exist (bid request → bids received → award → signed) is out-of-system today. Forces a real entity-shape decision.
- **[3 — Schedule dependencies](3-schedule-deps.md).** Unlocks the biggest open questions on UI. Without `Activation.dependsOn`, there's no critical path, no real gantt, no schedule-shape visualization. Forces the MCP-app-vs-web-app decision for the dashboard.
- **[4 — Subcontractor onboarding / qualification](4-sub-onboarding.md).** Unlocks the second-biggest open questions on UI. Sub vetting (COI, W9, master subcontract) requires getting documents from people who don't have Claude Desktop. Forces the external-party UX decision and the integration-ownership decision.
- **[5 — Payments](5-payments.md).** Understood; the last major thing. Pay apps (G702/G703), lien waivers, sub payments, retainage, billed-vs-paid. Builds on scope 1 (client ledger) + scope 4 (external-party UX for lien-waiver flow).

## Out of scope (forever-ish)

These are intentionally not in any scope above and unlikely to land in v1:

- **Plans + Options** (construction drawings with variants). Not needed for custom / personal builds; the schema leaves slots for `planRef` / `optionRef` but no UI.
- **Home-buyer website + subs portal.** Future extensions; the external-party UX decision in scope 4 might land something portal-shaped, but a full portal isn't in scope.
- **CRM** (HubSpot-style). Subs and clients are just `Party` rows in the data model.
- **Multi-tenant + permissions.** Two operators (Max + Salman); Clerk gives per-user identity but no role/permission layer on top.
- **Fancy ledger logic.** QuickBooks stays the book of record.
- **Custom auth UI.** OAuth via Clerk is in scope (required by claude.ai Custom Connectors, per [ADR 0012](../../decisions/0012-clerk-for-prod-mcp-oauth.md)); building our own sign-in screens on top is out — Clerk hosts consent.
- **CI.** Pre-commit + pre-push hooks cover local discipline; CI enters when remote collaboration does.

## How to navigate

- **"What's next?"** → [`now.md`](../now.md). Always the answer.
- **"Why is this scope before that one?"** → this file (priority + rationale).
- **"What's actually in scope N?"** → `scope/N-*.md`.
- **"What's *not* slotted yet?"** → [`backlog.md`](../backlog.md). Open questions and cross-cutting design decisions live there.
- **"What was decided and why?"** → [`docs/decisions/`](../../decisions/) (ADRs).
