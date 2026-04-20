# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M3 — First MCP app (cost-entry form)](milestones.md) — on `slice/cost-entry-form`

## Up next

1. **Desktop dogfood pass — close guide §7 unverified rows.** Connect local + prod to Claude Desktop, invoke `cost_entry_form` against seeded D1 state, verify: iframe renders; pre-fill from `structuredContent` populates read-only displays; missing-hint shows for partial context; Save is gated on `e.isTrusted` + `canSave`; `record_cost` round-trip writes a row. Any row that stays red becomes a backlog entry. Then drop the `@modelcontextprotocol/ext-apps` entry from `bunfig.toml` `minimumReleaseAgeExcludes` (unblocks on/after 2026-04-21 per ADR 0014).

## In flight

- **`slice/cost-entry-form` — build phase shipped, dogfood next.** Commit path: (1) ADRs drafted, (2) `now.md` kickoff, (3) `packages/mcp-server/` → `apps/mcp-server/` move, (4) PR #36 SDK wire-up + stub HTML, (5) PR #37 `apps/cost-entry-form/` Vite singlefile scaffold, (6) integration commit (this one) — workspace dep wired, stub replaced by real HTML, `turbo.json` `^build` dependsOn added for typecheck/test/dev/deploy.

## Waiting on

*(nothing)*

## Recently done

- **M3 build phase landed on slice** ([PR #36](https://github.com/mdml/gc-erp-mcp-server/pull/36) SDK wire-up, [PR #37](https://github.com/mdml/gc-erp-mcp-server/pull/37) view scaffold, integration commit, 2026-04-20): `cost_entry_form` app tool registered via `@modelcontextprotocol/ext-apps@1.6.0` with UI/text-only variants gated on `getUiCapability()` inside `oninitialized`; Vite singlefile view with Save-button attestation (`e.isTrusted` + `canSave`); `PostMessageTransport` signature drift caught and fixed in the vendor guide during review.
- **MCP Apps vendor guide landed** ([PR #35](https://github.com/mdml/gc-erp-mcp-server/pull/35), 2026-04-20): POC-driven verification of `@modelcontextprotocol/ext-apps@1.6.0`; closed 5 spike-claim deltas (most load-bearing: wrangler split-assets landmine §6.4, `getUiCapability` call-site correction §6.8). First exercise of the new vendor-guide convention; seeds ADR 0014.
- **Post-M2 hygiene retro landed** ([PR #34](https://github.com/mdml/gc-erp-mcp-server/pull/34), 2026-04-19): 7 `draft.md` observations folded into durable decisions — new-vendor → POC → vendor-guide forcing function, `--help`-before-secrets invariant, repo-wide rebase-merge-only (server-side verified), Desktop-prod flagged unverified, `apps/` move deferred to M3 slice scaffolding.
