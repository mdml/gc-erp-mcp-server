---
type: ADR
id: "0014"
title: "Adopt `@modelcontextprotocol/ext-apps` for MCP Apps UIs"
status: proposed
date: 2026-04-20
spike: "0001"
---

## Context

M3 ships the repo's first MCP "app" — a cost-entry form that Claude renders inline, pre-fills from context, and submits via the existing `record_cost` tool. M4 (`job_dashboard`) and M5 (`pay_app_preview`) follow the same pattern. Before building the first form, we had to decide *how* an MCP server attaches UI to a tool result at all.

[Spike 0001](../spikes/0001-mcp-apps-sdk.md) evaluated the rendering landscape. [`docs/guides/mcp-apps.md`](../guides/mcp-apps.md) — written under the [post-M2 hygiene retro](../retros/2026-04-19-post-m2-hygiene.md)'s new-vendor-guide convention — then drove a disposable Cloudflare Worker POC that verified or flagged every spike claim against the installed SDK. Both documents point at one candidate with any traction: `@modelcontextprotocol/ext-apps` — the reference implementation of SEP-1865 (status: stable as of 2026-01-26) by the MCP spec authors. Rolling our own would mean re-implementing ~21 JSON-RPC-over-`postMessage` message types plus the host-sandbox handshake for a pattern that's already shipped.

Key properties the POC verified, which made this ADR possible in one pass rather than a second spike:

- **Workers-clean.** Zero `node:*` imports across the entire `dist/`, zero runtime dependencies, `+4.3 KB` gzipped over the current Worker bundle. No `nodejs_compat` flag change required.
- **Auth stays at the `/mcp` boundary.** View → server calls go as regular `tools/call` proxied over the *same* authenticated MCP session — the view never holds a credential. [ADR 0012's](0012-clerk-for-prod-mcp-oauth.md) "every `/mcp*` request authenticated before `McpAgent`" invariant extends to app-UI traffic automatically.
- **Progressive enhancement is a first-class contract.** `getUiCapability()` reports whether the connected host advertises `io.modelcontextprotocol/ui`; non-UI hosts stay on text-only `record_cost` with no code fork.

## Decision

**Adopt `@modelcontextprotocol/ext-apps@1.6.0` as the MCP Apps SDK for `cost_entry_form` (M3) and future apps (`job_dashboard` M4, `pay_app_preview` M5).** Scaffold each app under [`apps/<name>/`](0013-apps-layout-convention.md) as a Vite + `vite-plugin-singlefile` bundle; inline the output HTML into the Worker at build time via a wrangler Text-loader rule. Register each app tool via `registerAppTool` gated on `getUiCapability()` — called inside `McpAgent.init()` or per-request, never at class construction. Submission round-trips as a model-visible `tools/call` to the existing domain tool (`record_cost` in M3); no new submission surface, no new auth path.

## Options considered

- **A (chosen): `@modelcontextprotocol/ext-apps@1.6.0`.** SEP-1865 reference implementation, Workers-clean, zero deps, authors-of-record for the extension spec.
- **B (rejected): Hand-roll against the SEP-1865 protocol directly.** ~21 message types + sandbox-proxy handshake + CSP plumbing + host-context notifications to re-implement. Weeks of work for a pattern already written; first non-hello-world app would surface the missing edge cases.
- **C (rejected): [`mcp-ui`](https://mcpui.dev/) community SDK.** Pre-dates the SEP; spec authors explicitly position `ext-apps` as the successor. Adopting now would force a port once hosts settle on the SEP-1865 wire format.
- **D (rejected): Wait for a non-Anthropic alternative.** None credible exists. The spec is stable, the SDK is published by the spec working group, and Claude Desktop + claude.ai are the dogfood hosts — waiting yields nothing to wait for.

## Consequences

**Easier:**

- Shared UI scaffolding across M3/M4/M5 — each app is a `apps/<name>/` Vite project with the same server-side `registerAppTool` + `registerAppResource` pair.
- Progressive enhancement for hosts that don't advertise the extension — free graceful degradation to text-only tool calls with no branch.
- Auth / session handling unchanged — view-initiated calls travel over the same Clerk-authenticated `/mcp` session established at `initialize`.

**Harder (the constraints the vendor guide surfaced):**

- **`wrangler.jsonc` needs a Text-loader rule for any workspace that inlines HTML** (guide [§6.4](../guides/mcp-apps.md)): `rules: [{ type: "Text", globs: ["**/*.html"], fallthrough: false }]`. Without it, wrangler silently splits the bundle into `index.js` + `<hash>-view.html` — type-checks, deploys, breaks the "one Worker bundle" posture. This was the real landmine, not the spike's suspected `fs.readFile` one.
- **`getUiCapability()` probe call-site matters** (guide [§6.8](../guides/mcp-apps.md)). Called at class construction, the client capabilities map is empty (no `initialize` yet) and the probe silently returns `undefined`, registering the text-only variant for every host. Call it inside `McpAgent.init()` or per-request.
- **`registerAppResource` is the 5-arg positional signature**, not the 3-arg object form that appears in some SDK skill docs (guide [§6.1](../guides/mcp-apps.md)). `bun run typecheck` catches the mistake; don't copy the wrong snippet.
- **`App.callServerTool` takes a single params object** (guide [§6.7](../guides/mcp-apps.md)): `app.callServerTool({ name, arguments })`. Spike 0001 §6c's positional form is stale in 1.6.0.
- **Zod ≥ 3.25 hard floor** (guide [§6.3](../guides/mcp-apps.md)). Satisfied at 4.3.6; flag for future contributors standing up scratch projects.

**Quarantine exception (timeboxed):**

- v1.6.0 was published 2026-04-14 → 6 days old at this ADR's date (2026-04-20) → *inside* the repo's 7-day [`minimumReleaseAgeExcludes`](../../bunfig.toml) window. If [M3's slice](../product/milestones.md#m3) lands on 2026-04-20 the dep needs a timeboxed entry; if on/after 2026-04-21 it does not. The slice adds or skips the entry based on its merge date; either way the `minimumReleaseAgeExcludes` line is removed (or never added) once the version crosses the window.

**Unverified end-to-end (to close during M3's first dogfood pass):**

- Claude Desktop actually rendering the view iframe.
- Desktop honoring `notifications/resources/updated` for cache invalidation when the HTML bundle changes.
- `App` + `PostMessageTransport` handshake against Desktop's host envelope (signature shape is static-verified; runtime handshake is not).
- claude.ai web + mobile parity.

These rows (guide [§7](../guides/mcp-apps.md)) become M3 backlog entries if they don't close during dogfood.

**What triggers re-evaluation:**

- Claude Desktop or claude.ai drops SEP-1865 support or diverges from the spec materially.
- `@modelcontextprotocol/ext-apps` is deprecated in favor of a successor extension (SEP-N, N > 1865).
- Bundle cost grows past a meaningful fraction of the Worker budget as M4/M5 apps land — currently +4.3 KB gz for the SDK plus per-app HTML payload (Vite singlefile keeps this under ~50 KB gz for a single form per spike [§5](../spikes/0001-mcp-apps-sdk.md)).

## Advice

[Spike 0001](../spikes/0001-mcp-apps-sdk.md) laid out the research landscape; the [MCP Apps vendor guide](../guides/mcp-apps.md) — the first exercise of the post-M2-hygiene retro's new-vendor-guide convention — closed five spike-claim deltas by running a disposable Worker against the installed SDK (most load-bearing: the wrangler split-assets landmine and the `getUiCapability` call-site correction). That sequence (spike → vendor-guide POC → ADR) is how this repo takes on a new vendor going forward; this ADR is the first ratification of the pattern.
