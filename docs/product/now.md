# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** M3 complete 2026-04-20. Prepping M4 kickoff next session.

## Up next

1. **Drop `@modelcontextprotocol/ext-apps` from `bunfig.toml` `minimumReleaseAgeExcludes`.** On/after 2026-04-21 the 1.6.0 version ages past the 7-day quarantine window; one-line edit + commit. Track via `bun pm view @modelcontextprotocol/ext-apps time`.
2. **PR `slice/cost-entry-form` → `main`, rebase-merge, delete branch.** M3 milestone done — open the PR with the full slice history (M3 ADRs + `apps/mcp-server/` move + SDK wire-up + view scaffold + integration commit + PR #38 capability fix + dogfood doc updates). Expect a review round; don't self-merge.

## In flight

*(nothing — slice ready for merge)*

## Waiting on

*(nothing)*

## Recently done

- **M3 dogfood landed** (slice/cost-entry-form, 2026-04-20): Desktop dogfood verified all five guide §7 rows (iframe render, `App` + `PostMessageTransport` handshake, missing-ID UX, Save happy path → `cost_wVsblVEW_Js1jCgecaOmn` in D1, Save attestation rejects chat-driven submit). Bug caught mid-dogfood: §6.8's `oninitialized`-deferred registration didn't advertise `resources` capability — fixed in [PR #38](https://github.com/mdml/gc-erp-mcp-server/pull/38), guide corrected. Desktop in-session cache invalidation deferred to [backlog](backlog.md#runtime--mcp).
- **M3 build phase landed on slice** ([PR #36](https://github.com/mdml/gc-erp-mcp-server/pull/36) SDK wire-up, [PR #37](https://github.com/mdml/gc-erp-mcp-server/pull/37) view scaffold, integration commit, 2026-04-20): `cost_entry_form` app tool registered via `@modelcontextprotocol/ext-apps@1.6.0`; Vite singlefile view with Save-button attestation (`e.isTrusted` + `canSave`); `PostMessageTransport` signature drift caught and fixed in the vendor guide during review.
- **MCP Apps vendor guide landed** ([PR #35](https://github.com/mdml/gc-erp-mcp-server/pull/35), 2026-04-20): POC-driven verification of `@modelcontextprotocol/ext-apps@1.6.0`; closed 5 spike-claim deltas (most load-bearing: wrangler split-assets landmine §6.4, `getUiCapability` call-site correction §6.8). First exercise of the new vendor-guide convention; seeds ADR 0014.
