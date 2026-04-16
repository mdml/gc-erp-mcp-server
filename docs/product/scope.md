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
- **Multi-tenant, auth, permissions** — it's just Max + Salman.
- **Fancy ledger logic** — QuickBooks stays the book of record for now.
- **OAuth** — bearer token is fine for two users; upgrade when we cross ~3 operators.
- **CI** — pre-commit + pre-push hooks cover local discipline; CI enters when remote collaboration does.
