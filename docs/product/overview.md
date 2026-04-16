# Product overview

## Goal

Build a lightweight GC (general contractor) ERP where the product is an **MCP server**. The server exposes the data model, tool methods, and composable UI components (MCP "apps") that an MCP client (e.g. Claude Desktop, Claude Code, Claude mobile) renders and orchestrates.

Initial use case: Max and Salman Ahmad GC'ing our own projects (~1–5 per year). Dogfood-first. Not a SaaS pitch.

> The product is an MCP server. One could even imagine extending this in the future to have the MCP server manage a home-buyer website and a subs website (for qualification, lien waivers, etc.).

## Success criteria

- A working MCP server that lets Max and Salman run one real job end-to-end: commitments in, NTPs issued, costs tracked, pay app generated, lien waivers collected.
- Schedule falls out of commitments, not drawn by hand — variance to committed lead/build time is visible without extra work.
- Most of the implementation is written by Claude Code against a tight spec, so we can see quickly whether the "GC ERP as MCP server" thesis has legs.
- Cost-to-complete forecast for an active job is accurate within the limits of what the commitments encode.

## Source

Brainstorm with Claude on 2026-04-15. Fleshed out data model, commitment-based scheduling, MCP apps as UI components, local-first vs server tradeoffs, and scoped to dogfood-first use case for Max + Salman on 1–5 jobs/year.

## Collaborators

- Max Leiserson — primary builder, will dogfood on own projects.
- Salman Ahmad — co-dogfooder, will use on own projects.
