---
type: ADR
id: "0001"
title: "The product is an MCP server, not a web app"
status: active
date: 2026-04-15
---

## Context

A GC ERP has an obvious default shape: a web app with forms for cost entry, commitments, pay apps, etc. We are deliberately not building that. Instead, the thesis is that the *product* is an MCP server: a set of tool methods, resources, and composable UI components (MCP "apps") that an MCP client like Claude Desktop / Claude web / Claude mobile renders and orchestrates.

If this thesis holds, several things follow: the operator interacts with the system through a general-purpose AI client rather than a bespoke UI; the system's job is to expose well-shaped tools and data, not to build chrome; and distribution is "point your MCP client at this URL," not "install our app."

If it fails, we will know quickly because the daily operations of running a job will feel worse than just using a web app. Dogfood-first (see [ADR 0004](0004-dogfood-first.md)) exists in part to catch this fast.

## Decision

**The product is an MCP server.** The UI is not a separate web app we own; it is MCP apps rendered by whichever MCP client the operator is using. We may ship our own client later, but it is not the product.

## Options considered

- **MCP server** (chosen): We publish tools + MCP apps; the operator brings their own client. Distribution is an HTTP URL + bearer token. Lowest surface area to maintain; rides on general-purpose AI clients that are already getting better independently.
- **Web app with an API**: Conventional SaaS shape. Well-understood; bigger surface to build and maintain; doesn't test the thesis.
- **Web app that also exposes MCP**: The product could be the web app *and* an MCP surface. Worst of both — we'd still own the UI and its quirks, and the MCP surface would be an afterthought rather than the core. If MCP becomes the primary interaction, the web app is dead weight.
- **Desktop app (Electron/Tauri)**: Closer-to-the-customer feel but phones are out. Max and Salman need to answer sub texts from a job site, so mobile is table stakes. Deferred.

## Consequences

- **Easier:** avoid building and maintaining a frontend; benefit from improvements in MCP clients; feature velocity concentrates on data model + tool design rather than chrome.
- **Harder:** we cannot shape the UX directly — we design tools and hope the client renders them usefully; we are tied to MCP spec evolution; edge cases in clients (e.g. mobile connector UX) can bite us.
- **Re-evaluate** if: dogfood shows that key operator tasks are clunky in Claude Desktop/mobile specifically because we don't own the UI, and we cannot improve them by shipping a better MCP app; or if MCP adoption stalls such that the clients we'd want to ride don't exist.

## Related

- [docs/product/overview.md](../product/overview.md) — the broader product pitch
- [docs/guides/ARCHITECTURE.md](../guides/ARCHITECTURE.md) — how the MCP server is built
- [MCP Apps extension spec](https://modelcontextprotocol.io/extensions/apps/overview) — the mechanism for shipping UI components
