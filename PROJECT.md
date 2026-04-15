# Goal
---
- Build a lightweight GC (general contractor) ERP where the product is an **MCP server**. The server exposes the data model, tool methods, and composable UI components (MCP "apps") that an MCP client (e.g. Claude Desktop, Claude Code) renders and orchestrates.
- Initial use case: me and Salman Ahmad GC'ing our own projects (≈1–5 per year). Dogfood-first. Not a SaaS pitch.

> The product is an MCP server. One could even imagine extending this in the future to have the MCP server manage a home-buyer website and a subs website (for qualification, lien waivers, etc.).

# Success criteria:
---
- A working MCP server that lets me and Salman run one real job end-to-end: commitments in, NTPs issued, costs tracked, pay app generated, lien waivers collected.
- Schedule falls out of commitments, not drawn by hand — variance to committed lead/build time is visible without extra work.
- Most of the implementation is written by Claude Code against a tight spec, so we can see quickly whether the "GC ERP as MCP server" thesis has legs.
- Cost-to-complete forecast for an active job is accurate within the limits of what the commitments encode.

# Scope:
---
- In:
    - Data model: costs, scopes (nested), jobs, projects, commitments, activities, patches.
    - Commitment-based scheduling: NTP event drives start-by / finish-by / variance.
    - MCP apps (UI components shipped by the server): cost-entry form, commitment-entry form, job dashboard, pay app (AIA G702/G703), lien waiver tracker.
    - Thin integrations: email ingestion for invoices, PDF generation for legal artifacts, QuickBooks export (push-only) for the accountant.
    - Audit trail: costs are append-only; patches are content-addressed.
- Out (for v1):
    - Plans + Options (construction drawings with variants) — not needed for custom/personal builds; leave slots in the schema but no UI.
    - Home-buyer website and subs portal — future extensions, not v1.
    - CRM (HubSpot-style) — subs and clients are just People + Orgs in the data model.
    - Multi-tenant, auth, permissions — it's just us two.
    - Fancy ledger logic — QuickBooks stays the book of record for now.

# Milestones:
---
- **M1 — Data model + MCP server skeleton.** Zod schemas for costs, scopes, commitments, activities, jobs, projects; MCP server that exposes them as resources + basic CRUD tools. No UI yet.
- **M2 — Commitment + NTP model.** Create a commitment, issue NTP, derive start-by/finish-by, compute variance. Test with synthetic data.
- **M3 — First MCP app (UI component).** Ship a cost-entry form as an MCP app. Prove the pattern: Claude chooses the form, pre-fills from context, user confirms.
- **M4 — Job dashboard.** One screen showing: budget vs commitment vs cost vs billed vs paid, per scope; active NTPs and variance.
- **M5 — First legal artifact.** Generate a pay app (G702/G703) as a PDF from a job's cost + commitment state.
- **M6 — Run a real job.** Use it on one of our actual projects. Fix what breaks.

# Backlog:
---
- [ ] Decide: CSI codes as the scope taxonomy, or custom lightweight list? Commercial CSI may be overkill for residential custom.
- [ ] Decide: storage — Postgres, SQLite + Litestream, or something even simpler for v1?
- [ ] Decide: where do commitments live in git-shaped storage vs. mutable DB? Leaning append-only events + materialized state.
- [ ] Design the "activity" concept for scopes done in multiple pieces (e.g. Framing → Lumber Drop, Framing → Frame, Framing → Punch). Decide: nested scopes, or flat scopes with activities under commitments.
- [ ] Sketch commitment schema: price (lump / $ per unit), scope ref, throughput, lead time, build time, activation(s).
- [ ] Sketch NTP event: commitment ref, date, site-ready check, expected start-by, expected finish-by.
- [ ] Pick the POC wedge — I'd argue pay app automation is the sharpest (painful, recurring, money-on-the-line).
- [ ] Study Adaptive (AI-native construction accounting) — closest to this thesis, either a template or a competitor.
- [ ] Decide how Claude Code will be fed the spec: one living spec doc in the repo, or one SKILL.md per module?

# Decisions:
---
- **Dogfood-first.** Build for me + Salman on our own jobs before thinking about anyone else. 1–5 jobs/year is enough surface area to validate the model without SaaS overhead.
- **The product is the MCP server.** Not a web app. Distribution is `npx` / plugin install into an MCP client. The UI lives inside the server as MCP "apps."
- **Commitment-based data model, full stop.** A commitment is a 5-tuple: price, scope, throughput, lead time, build time. Schedule is derived from commitments + NTP events, not drawn by hand.
- **Notice to Proceed is a first-class event.** NTP starts the clock; start-by / finish-by / variance fall out automatically.
- **Defer Plans + Options.** Needed for production home building, not for custom. Keep the slots in the schema.
- **Projects are a group of jobs** (since contracts are often signed at the project level), but for v1 a project may have exactly one job.
- **Claude Code builds as much as possible.** This is itself a test of the thesis — if an MCP-shaped ERP is easy for an AI to build, it's probably also easy for an AI to *operate*.

# Links:
---
- Collaborator: Salman Ahmad
- MCP Apps extension spec: https://modelcontextprotocol.io/extensions/apps/overview

## Source Data (if any)
> [!info]- Raw Transcript (Optional)
> **Recording Date:** 2026-04-15
> **AI Processing Engine:** Claude (Cowork)
> ---
> Brainstorm with Claude on 2026-04-15. Fleshed out data model, commitment-based scheduling, MCP apps as UI components, local-first vs server tradeoffs, and scoped to dogfood-first use case for me + Salman on 1–5 jobs/year.
