# Backlog

Open questions that haven't been slotted into a [scope file](scope/) yet. When a question gets slotted, it moves into the relevant scope file's *Open questions* section and leaves this file. When a question resolves, it becomes an ADR ([`docs/decisions/`](../decisions/)) or lands in [SPEC.md](../../SPEC.md) / [TOOLS.md](../../TOOLS.md).

> Slotted ≠ resolved. A scope file's *Open questions* are still open — they're just bound to a scope and will be answered when that scope is worked. Backlog is for questions that aren't yet bound to anywhere.

## Data model / schema

- **Scope taxonomy.** CSI codes vs custom lightweight list vs free-form. Commercial CSI feels heavy for residential custom. Leaning: free-form `name` + optional `code`, with a curated seed list. *(Currently: free-form; see [SPEC.md §1](../../SPEC.md).)* Could land in [scope 3](scope/3-schedule-deps.md) (dashboard rendering) or [scope 5](scope/5-payments.md) (pay-app line items) when either forces the decision.
- **ScopeSpec vocabulary.** Currently closed (`materials`, `installNotes`, `planRef`, `optionRef`); Zod silently strips unknown keys. Forks: keep closed for consistency, open via `.passthrough()`, or add an explicit `extras: Record<string, unknown>` field. Bites the first time someone wants to attach scope-level data the schema doesn't anticipate. Surfaced in [dogfood/testing-log.md](../dogfood/testing-log.md) (2026-04-20).
- **Scope templates / per-project reuse.** `scopes.jobId` is NOT NULL — every job rebuilds its tree from scratch, even when structurally identical (e.g. the same kitchen-remodel layout repeated on a second property). Forks: templates-as-clones (`clone_scopes({fromJobId, toJobId})` or a `ScopeTemplate` entity) or promote Scope to project level (deeper — breaks "scope belongs to a job"). Could land in [scope 1](scope/1-client-ledger.md) when project-level work makes the question concrete, or as its own future scope. Surfaced in [dogfood/testing-log.md](../dogfood/testing-log.md) (2026-04-20).

## Patches / event sourcing

- **Authoring UX.** Does the operator batch edits into a patch consciously, or does the server auto-group edits within a session?
- **Concurrency.** Single-operator is fine for dogfood. Two-operator on one job eventually means two patches at once. Git-style branching? Linear chain with optimistic concurrency? Likely post-v1.
- **Patch granularity.** Should a patch span multiple jobs (project-level CO affecting two jobs)? Current schema says no.

## Runtime / MCP

- **How Claude picks an app.** Return type? Explicit hints? Re-read the MCP Apps extension spec when [scope 3](scope/3-schedule-deps.md) builds the next app.
- **Desktop in-session resource cache invalidation.** M3 dogfood (2026-04-20) found Claude Desktop caches `resources/read` responses for the lifetime of a session: a rebuilt view HTML surfaces in the iframe only after a full Desktop quit+reopen. Unknowns: (a) does Desktop honor `notifications/resources/updated` if the server emits it? (not tested — server currently never emits); (b) is there a clean dev-time hook to wire the emit on HTML change? Bites the next iteration on any MCP app view. See [mcp-apps.md §7](../guides/mcp-apps.md#7-verified-vs-unverified).

## Cross-cutting design

Vision-level questions that aren't tied to a single scope. Surfaced together in the 2026-04-20 dogfood session ([dogfood/testing-log.md](../dogfood/testing-log.md)). Several are *forced* by specific scopes (cited below); they live here because the answer applies across multiple scopes.

- **Agent topology.** Single general-purpose agent (on-demand, broad context) vs. specialized skills (on-demand, narrow) vs. scheduled intelligence (cron-initiated, no user). Likely per-capability: e.g., "process bids from inbox" → scheduled; "draft a change-order response" → on-demand-general; "issue NTP" → scheduled-skill + operator-attestation MCP app. First forced by [scope 4](scope/4-sub-onboarding.md)'s scheduled-skill use case (COI expiry alerts).
- **Integration ownership.** Us-as-integrator (we host `send_lien_waiver` API + status webhooks — predictable, auditable) vs. Claude-as-orchestrator (we expose data + verbs; Claude stitches Gmail + DocuSign + our MCP — flexible, no API maintenance). MCP-first ethos leans orchestration, but audit-critical flows (payments, lien-waiver status) may need us-as-integrator for reliability/traceability. First forced by [scope 4](scope/4-sub-onboarding.md) (sub-onboarding integrations); [scope 5](scope/5-payments.md) (lien-waiver flow) is the second use case.
- **External-party UX.** Subs and clients don't have Claude Desktop. Inbound rides on the channels they *do* have — email, SMS, web. Forks: build-custom-forms (lightweight web app + form builder), integrate-existing (Notion DBs, Google Forms, DocuSign), or email-only degenerate. Forced by [scope 4](scope/4-sub-onboarding.md); reused in [scope 2](scope/2-bidding.md) (bid intake) and [scope 5](scope/5-payments.md) (lien-waiver flow).
- **Operator UX split (MCP apps vs. web app).** MCP apps strong for attestation (the click *is* the product, per the M3 pattern); weak for scanning-across-rows (dashboards, bulk edits, filtering). Read-only web app paired with attesting MCP apps may be the right split. Forced by [scope 3](scope/3-schedule-deps.md) (the schedule dashboard is the canonical scanning-shaped surface); [scope 2](scope/2-bidding.md) (bid comparison) is the second use case.

## Dev tooling

- **Wire `db:seed:kitchen:local`.** The script exists (root + `packages/database/db:seed:kitchen:local`) but its handler in [`packages/database/src/seed/run.ts`](../../packages/database/src/seed/run.ts) still exits 1 with "D1 provisioning pending". Likely becomes moot at [scope 0](scope/0-foundation.md) P2 — the Rust+Postgres re-encoding will rebuild seeds in the new shape; the kitchen fixture probably ports as a `sqlx` seed.

## File ingestion

- **R2 retention policy.** Document rows are permanent; the R2 objects may not need to be. Becomes Tigris-equivalent (or whatever blob store ships with [scope 0](scope/0-foundation.md)) after the pivot — defer the policy decision until then.

## Research / external

- **Study Adaptive** (AI-native construction accounting) — template or competitor; informs [scope 1](scope/1-client-ledger.md) and [scope 5](scope/5-payments.md) shape.
