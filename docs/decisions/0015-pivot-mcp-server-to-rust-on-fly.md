---
type: ADR
id: "0015"
title: "Pivot the MCP server to Rust + axum on Fly.io"
status: active
date: 2026-05-11
---

## Context

This MCP server's product value is dominated by its data model. SPEC.md tracks costs, scopes, commitments, activations, jobs, projects, NTPs, patches, and projections — a graph of related entities with non-trivial valid-state rules. Examples already encoded as ADRs: commitment-void semantics conditional on projection state ([ADR 0009](0009-void-state-projected-on-commitments.md)); activations carrying scopeId ([ADR 0005](0005-activations-carry-scopeid.md)); apply-patch atomicity ([ADR 0008](0008-apply-patch-atomicity-via-d1-batch.md)); NTP derivation from current activation ([ADR 0007](0007-ntp-derivation-from-current-activation.md)). The TypeScript implementation captures these via Zod schemas and runtime checks; design errors that violate the rules surface only at the first runtime hit.

Three project-specific reasons argue for switching to Rust:

1. **Best-in-class type system + compiler for the data model.** This is the largest payoff. Rust's sum types (enums with payload), exhaustive `match`, newtype pattern, and ownership rules let us encode many of the data-model's valid-state rules as types. The compiler catches invariant violations at build time rather than at the first hit in production. With as much branching invariant logic as SPEC.md already carries (and the M5/M6 work ahead), pushing more of it into the type system meaningfully shrinks the surface for correctness bugs.
2. **Safety by construction matters because real money is on the roadmap.** M5 (pay-app generation, G702/G703) and M6 (run a real job) put dollar amounts on legal artifacts. A bug in cost projection or commitment state can produce a wrong number on something a contractor signs. Rust's safety properties — no nulls, no implicit failures, exhaustive error handling, no data races — collapse a category of correctness bugs that no test suite reliably catches.
3. **Speed if we scale.** Even at single-project scale the cost ledger grows monotonically. If we eventually run multiple concurrent projects with years of accumulated history, a long-running native binary backed by Postgres handles orders of magnitude more throughput than per-request V8 isolates against D1, with simpler operational shape and no edge-distribution story we don't need at two-operator scale.

The dogfood-pause moment makes this the cheapest pivot window: M3 (Apps SDK cost-entry-form) landed 2026-04-20; M4 hadn't kicked off; no real production data; nothing in flight on `main`. Switching now costs less than switching after M4 lands in TypeScript.

OAuth was the candidate concern for Cloudflare lock-in, since [ADR 0012](0012-clerk-for-prod-mcp-oauth.md) sits squarely in the auth path. Verification (read [auth.ts](../../apps/mcp-server/src/auth.ts) + ADR 0012 + [apps/mcp-server/CLAUDE.md](../../apps/mcp-server/CLAUDE.md)): the auth shape is **Clerk = Authorization Server, Worker = Resource Server**. The Worker validates a Clerk-issued JWT against Clerk's JWKS and proxies two `/.well-known` endpoints. None of those steps touches a Cloudflare primitive. `clerk-rs` exists; if it's rough, hand-rolled JWT validation against Clerk's JWKS is ~50 LOC of `jsonwebtoken` + a JWKS cache. **OAuth is not the lock-in.**

The actual Cloudflare-shaped pieces are the `McpAgent` / Durable Objects session model and the D1/R2 storage primitives. Those are what the pivot translates.

Hosting choice — Fly.io over Cloudflare Workers (workers-rs): native Rust on Fly.io aligns with the mainstream Rust async ecosystem (tokio, axum, tower, sqlx with build-time query checking against a real Postgres). workers-rs is a WASM dialect with a substantially smaller ecosystem and community; many of the libraries that make Rust attractive for this use case either don't run on Workers or run with constraints (sqlx's compile-time query verification needs a native database connection at build time; tokio's full async model is constrained on Workers; the broader crate ecosystem assumes native targets). Native also exits the DO/D1 model — a long-running process holds MCP session state in memory or in Postgres without per-session DO ceremony.

## Decision

**Rebuild the MCP server in Rust (`axum` + `rmcp` + `sqlx` + Postgres), hosted on Fly.io.** Sequenced as four phases (P1–P4 to avoid collision with product milestones M1–M6):

- **P1 — Disposable Rust-MCP POC + vendor guide.** Per the repo's "new vendor → POC → guide → ADR" rule. Smallest possible `axum` + `rmcp` + Clerk JWT validation + `sqlx`/Postgres deployed to Fly.io. Outputs: [`docs/guides/rust-mcp.md`](../guides/rust-mcp.md) capturing what actually works; one or more focused stack ADRs (e.g. `clerk-rs` vs hand-rolled JWT, MCP transport shape).
- **P2 — Hand-coded data model.** Max writes the Rust data model and valid-states machinery by hand — domain enums, sqlx queries, error types, newtypes. Agents walk through idiom, not generate code. Scope ≈ SPEC §1. Rationale: this layer is the load-bearing artifact (per Context); writing it by hand keeps the domain author close to the type-encoding decisions.
- **P3 — MCP tools to dogfood parity.** Re-implement only the tools currently dogfooded in TS (not full TS-feature parity). Agent-driven with operator steering. One tool per slice/PR.
- **P4 — Cutover.** Deploy to Fly.io; point Claude Desktop at the new endpoint; retire the TS Worker; close out CF account usage for this project.

**Repo evolves rather than restarts.** Same git history; new code under `apps/mcp-server/` (Rust crate); old TS code archived in-tree (`apps/mcp-server.ts-archive/`) until P4, then deleted. The TS-Worker archive rename happens at the start of P1.

**Portability-layer work (Justfile + multi-harness AGENTS.md + sunset `packages/agent-config`) is split into [ADR 0016](0016-portability-layer-justfile-multi-harness.md)** as an orthogonal, independently-motivated change. It can ship before, after, or alongside this pivot. Recommended ordering: 0016 first (smaller, lower risk, validates the multi-harness story before there's a Rust port to drive through it).

## Options considered

- **A (chosen): Full pivot — Rust + Fly.io.** Justified by the three project-specific reasons in Context. Exits Cloudflare cleanly (Worker + D1 both go); opens up the mainstream Rust async ecosystem (sqlx with build-time query checking, tokio, full crate access). Cost: real port work for `McpAgent`/DO session model (translates to in-memory or Postgres-backed sessions) and the database (D1+Drizzle → Postgres+sqlx).
- **B (rejected): Rust on Cloudflare Workers via workers-rs.** Keeps the deployed surface; smaller hosting/migration scope. Rejected because the workers-rs WASM dialect cuts off most of the Rust ecosystem most relevant to this use case — sqlx's compile-time query verification requires a native Postgres connection at build time; tokio's full async story is constrained; many crates assume native targets. We'd give up much of the type-system + safety payoff that motivates the pivot. Also keeps us on D1 + DO session ceremony when the long-running process model is simpler.
- **C (rejected): Defer pivot, finish M4 in TS first.** Lowest-disruption option. Rejected because the dogfood-pause moment is the cheapest pivot window we'll get — landing M4 in TS guarantees more code to port without paying down any data-model encoding in Rust. M4 (whatever it ends up being) lands in Rust instead.
- **D (rejected): No pivot.** Status quo doesn't address any of the three motivating concerns (type-system encoding of valid states, safety for money-bearing artifacts, throughput headroom for scale). Rejected on the merits of those concerns.

## Consequences

**Easier:**

- The data model's invariants get encoded in the type system — sum types for entity states, exhaustive matching on projection transitions, newtypes for IDs (no more bare strings for `cost_*` vs `scope_*`), `Result` for fallible ops. Compile-time catches that today require runtime tests or runtime Zod failures.
- `sqlx` compile-time-checks queries against a real Postgres at build time — categorically stronger than Drizzle's TS-side typing (Drizzle types don't catch a column rename in a DB migration; sqlx does).
- Long-running axum process simplifies MCP session state — in-memory or Postgres-backed; no DO-per-session ceremony that exists today only because Workers are stateless.
- Single binary, single Dockerfile, declarative `fly.toml`. Deploys are `fly deploy`; no `wrangler.jsonc` migrations file, no DO migration discipline.
- Throughput headroom — the Rust + Postgres combo handles orders of magnitude more concurrent load than Worker + D1 at our scale, with no edge-distribution story to maintain.

**Harder:**

- Real port cost. Best estimate: P1 (1–3 days), P2 (2–5 days), P3 (1–2 weeks at dogfood-parity scope), P4 (1 day). Wall-clock dependent on hand-coding pace at P2.
- **Rust's biggest ecosystem gap is UI-shaped — and we don't have a UI yet.** TypeScript dominates frontend (React, shadcn, Tailwind, design systems, Expo for mobile); Rust's frontend options (Leptos, Dioxus, Yew) are real but maturity-gated. This doesn't bite the pivot today — the only frontend artifact is the MCP App cost-entry-form, an iframe-hosted HTML+JS bundle that a Rust backend serves as readily as a TS one. It won't bite later either: when we build a real UI, it'll be a React + TS + shadcn frontend talking to the Rust backend over HTTP. The language boundary sits at the network protocol, not inside the codebase.
- Stack-specific maturity gaps within Rust itself: `clerk-rs` is less mature than `@clerk/backend`; `rmcp` is the official Rust MCP SDK but newer than the TS SDK. Both POC'd at P1.
- Lose `agents/McpAgent` session machinery (DO-per-session, hibernation). Replace with simpler in-memory or Postgres-backed session state — fine for two-operator dogfood, would need rethinking at much-larger scale.
- Lose D1's edge-distributed reads. Single-region Postgres on Fly is the trade; multi-region read replicas exist on Fly's Managed Postgres but aren't needed at current scale.
- Salman is currently a user / architecture-input collaborator, not a contributor. If he ever pairs in, he picks up Rust + Fly + the new toolchain at once. Not a blocker — flagging.
- ADRs and guides referencing Cloudflare/D1/Drizzle/agents-package conventions become historical context. Several `apps/mcp-server/CLAUDE.md` invariants get rewritten or deleted.

**Rollback plan:**

The TS Worker is archived in-tree (`apps/mcp-server.ts-archive/`) through P3. If the Rust port hits a hard blocker (rmcp doesn't support a needed transport feature; Clerk JWT validation in Rust is intractable; Fly hosting unworkable for some reason that the P1 POC missed), revert: rename archive back to `apps/mcp-server/`, restore `wrangler.jsonc` deploy, point Clerk back at the old hostname. Cost: ~half a day. After P4 the archive is deleted; rollback past that point means git history.

**Trigger for re-evaluation:**

- P1 POC reveals `rmcp` is missing a load-bearing capability (e.g. streamable-HTTP doesn't actually work, or the session model is incompatible with Claude Desktop's expectations) — re-evaluate the SDK choice or fall back to a custom MCP-protocol implementation, not the whole pivot.
- Fly.io has a material outage / pricing change during P1–P4 — Hetzner is the obvious fallback (operational muscle exists there); shape mostly the same since both run Docker.
- Project bandwidth for the port doesn't materialize — pause P2/P3, leave the TS Worker in place. ADR 0016's portability-layer work stands on its own and continues to pay back regardless.

## Advice

Decision shaped in chat (2026-05-11). Key inputs:

- Verification of OAuth's portability (read [auth.ts](../../apps/mcp-server/src/auth.ts) + [ADR 0012](0012-clerk-for-prod-mcp-oauth.md) + [apps/mcp-server/CLAUDE.md](../../apps/mcp-server/CLAUDE.md)) defused the main Cloudflare lock-in concern.
- The "P2 hand-coded by Max" sequencing is operator-elected: the data model is where domain knowledge concentrates, and writing it by hand keeps the type-encoding choices in the operator's head.
- Fly.io vs workers-rs settled on ecosystem grounds (sqlx compile-time query checking + native tokio require a non-WASM target).
