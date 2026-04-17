# Milestones

- **M1 — Data model + MCP server skeleton.** Zod schemas for costs, scopes, commitments, activities, jobs, projects; MCP server that exposes them as resources + basic CRUD tools. No UI yet. *(Complete 2026-04-17 — live D1/R2 provisioned, first tool invocation hit production.)*
- **M2 — Commitment + NTP model.** Create a commitment, issue NTP, derive start-by/finish-by, compute variance. Test with synthetic data.
- **M3 — First MCP app (UI component).** Ship a cost-entry form as an MCP app. Prove the pattern: Claude chooses the form, pre-fills from context, user confirms.
- **M4 — Job dashboard.** One screen showing: budget vs commitment vs cost vs billed vs paid, per scope; active NTPs and variance.
- **M5 — First legal artifact.** Generate a pay app (G702/G703) as a PDF from a job's cost + commitment state.
- **M6 — Run a real job.** Use it on one of our actual projects. Fix what breaks.
