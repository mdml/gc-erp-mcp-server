# Scope — v1

## In

- **Data model:** costs, scopes (nested), jobs, projects, commitments, activities, patches. See [SPEC.md](../../SPEC.md).
- **Commitment-based scheduling:** NTP event drives start-by / finish-by / variance.
- **MCP apps** (UI components shipped by the server): cost-entry form, commitment-entry form, job dashboard, pay app (AIA G702/G703), lien waiver tracker.
- **Thin integrations:** email ingestion for invoices, PDF generation for legal artifacts, QuickBooks export (push-only) for the accountant.
- **Audit trail:** costs are append-only; patches are content-addressed.

## Out (for v1)

- **Plans + Options** (construction drawings with variants) — not needed for custom/personal builds; leave slots in the schema but no UI.
- **Home-buyer website and subs portal** — future extensions, not v1.
- **CRM** (HubSpot-style) — subs and clients are just People + Orgs in the data model.
- **Multi-tenant + permissions** — it's just Max + Salman; Clerk gives us per-user identity (see auth below) but no role/permission layer on top.
- **Fancy ledger logic** — QuickBooks stays the book of record for now.
- **Custom auth UI** — OAuth via Clerk is in scope for prod (required by claude.ai Custom Connectors, per [ADR 0012](../decisions/0012-clerk-for-prod-mcp-oauth.md)); building our own sign-in screens on top is out — Clerk hosts consent.
- **CI** — pre-commit + pre-push hooks cover local discipline; CI enters when remote collaboration does.
