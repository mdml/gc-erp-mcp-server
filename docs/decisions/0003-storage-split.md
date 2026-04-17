---
type: ADR
id: "0003"
title: "D1 for domain state, R2 for documents, DO only for MCP session runtime"
status: active
date: 2026-04-17
---

## Context

[SPEC.md §4 Open Questions](../../SPEC.md) and [docs/product/backlog.md](../product/backlog.md) list storage as an unresolved question with a lean toward "Durable Object SQLite" per the initial architecture sketch. As of the M1 sprint, two new constraints sharpened the question:

1. **Session vs. domain state are on different lifecycles.** The current scaffold binds a `GcErpMcp extends McpAgent` class whose DO is keyed per MCP session (`streamable-http:${sessionId}`). Session state must die with the session (disconnect = forget). Job/commitment/cost state must outlive the session (reconnect from another device and the data is still there). Using the same DO for both requires either cross-session lookups into a different DO key (complex) or accepting that "DO SQLite" means a new, *separate* DO class keyed by `JobId`.

2. **Blob storage is a near-term requirement, not a later one.** [TOOLS.md §3.4](../../TOOLS.md) makes file ingestion a primary input path — invoices, plan sets, photos, lien waivers. R2 is the correct Cloudflare primitive for blobs, and defining the R2 layout now (vs. retrofitting later) avoids a `Document` schema migration.

The practical decision was therefore between three shapes:

- **A.** Domain state in a new `JobStore` DO keyed by `JobId`; session state stays in the existing `GcErpMcp` DO; blobs in R2.
- **B.** Domain state in D1 (cluster-wide SQLite); session state stays in the existing `GcErpMcp` DO; blobs in R2.
- **C.** Everything in the current session DO.

Option C is broken (state dies with session). The real choice is A vs. B.

## Decision

**Domain state — jobs, projects, scopes, activities, parties, commitments, activations, NTP events, costs, patches, document metadata — lives in Cloudflare D1 accessed via a typed drizzle client. Document blobs live in R2 keyed by `sha256`. The `GcErpMcp` Durable Object continues to own MCP-session runtime state only (transport buffers, session identity, subscriptions, hibernatable MCP-client connections, future OAuth state).**

Schema, migrations, typed client, and seed scripts all live in a new `packages/database` package — one source of truth imported by `packages/mcp-server` and by seed/migration tooling.

## Options considered

- **A. Per-job Durable Object (`JobStore` DO keyed by `JobId`)**
  - *Pros:* storage colocated with compute (zero Worker↔storage latency); per-job isolation gives a natural backup/export boundary; matches Cloudflare's "DO per partition" idiom.
  - *Cons:* cross-job queries require a fan-out or a secondary index DO (activity library, party library, "all open commitments across jobs" all become hard); two DO classes to reason about (`GcErpMcp` for session + `JobStore` for domain); read paths from outside a job (dashboard summaries, project-level roll-ups) need a coordinator. Load profile — 1–5 jobs × a few hundred writes/year/operator — doesn't benefit from DO's strong-consistency-per-partition guarantees.
- **B. D1 + R2 (chosen)**
  - *Pros:* single logical database, trivial cross-partition SQL (activity library, party library, "all commitments by counterparty"); D1 Time Travel gives point-in-time restore without extra machinery; drizzle + migrations + typed queries is the well-trodden path; R2 pre-signed URLs enable browser-direct upload from MCP Apps without Worker bandwidth cost.
  - *Cons:* one extra network hop Worker → D1 (tens of ms) vs. DO-colocated storage — irrelevant at our write volume; per-job isolation for backup/export requires application-level logic, not infrastructure.
- **C. Session DO for everything (current scaffold)**
  - *Rejected.* State dies with session; reconnect from a second device sees nothing.
- **D. Postgres (via Hyperdrive or external host)**
  - *Rejected.* Extra operational surface (external DB to host/pay for), no material advantage over D1 at our scale.
- **E. SQLite + Litestream (outside Cloudflare)**
  - *Rejected.* Requires a non-Cloudflare host, contradicting the "one deploy target" pattern already established in the infra CLI.

## Consequences

**Easier:**

- Reads across jobs are ordinary SQL (no fan-out, no coordinator).
- Drizzle gives type-safe query construction; schema + migrations + seeds co-located in `packages/database`.
- Pre-signed R2 PUT/GET URLs support MCP Apps doing direct browser-to-R2 uploads, keeping large-file bytes off the Worker.
- Testing: one D1 binding (Miniflare) + one R2 binding — both have solid local emulation. No DO round-trips for domain state in tests.
- Time Travel on D1 gives audit-posture "rewind the database to T" for free; our event-sourced `Patch` chain is still the authoritative history, but D1's point-in-time restore is a backstop.

**Harder:**

- D1 needs provisioning (new provider in `packages/infra/`) and binding to the Worker in `wrangler.jsonc`.
- R2 needs provisioning (new provider in `packages/infra/`) and binding.
- Schema migrations become part of the deploy pipeline (`wrangler d1 migrations apply`); migrations are SQL on disk, versioned alongside the code.
- `packages/database` adds a workspace package — standard tax, but it's another `CLAUDE.md` and another `vitest.config.ts` to keep in step.

**Would trigger re-evaluation:**

- Load profile changing dramatically — e.g. multi-tenant with hundreds of concurrent operators per job — could push toward per-job DOs for write throughput and isolation.
- A concrete need for per-job backup/export boundaries (compliance, sale of a dogfood job's data to a client) would also favor per-job DOs.
- D1 size limits (currently generous for our scale) becoming a ceiling; unlikely at 1–5 jobs/year.

## Advice

Decided in session with Max on 2026-04-17. Key reasoning points raised:

- "DO SQLite" in the backlog was shorthand for "SQLite on Cloudflare" without distinguishing session-scoped vs. job-scoped DO lifecycles. Surfacing that distinction flipped the lean.
- File ingestion is core to the product thesis (Claude parses invoice → persists blob → records cost), not a later nice-to-have — so R2 provisioning moves forward into M1 alongside D1.
- Content-addressed document storage (sha256 as the identity) dedupes automatically and gives a clean audit property.
