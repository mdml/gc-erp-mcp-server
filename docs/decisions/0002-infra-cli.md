---
type: ADR
id: "0002"
title: "Infra CLI as a separate packages/infra/ using raw fetch"
status: active
date: 2026-04-16
---

## Context

We've been running the MCP server on Cloudflare via `turbo run deploy` (which wraps `wrangler deploy`) plus a one-time out-of-band `wrangler secret put MCP_BEARER_TOKEN`. To extend the runtime surface — custom domain `gc.leiserson.me`, D1 for persistent job state, R2 for generated artifacts (pay-app PDFs, scans), Worker-scoped secrets — we need repeatable, idempotent, reviewable provisioning. Not a one-shot human runbook per change.

Two concrete drivers:

1. **Iteration speed.** Anticipated M1–M2 work wants D1 + R2 ready to go; declaring them in code means adding a table/bucket is a one-line commit rather than a dashboard click.
2. **Reversibility.** Renames, teardowns, and — eventually — moving between Cloudflare accounts should be code paths with tests, not tribal knowledge.

## Decision

**Create `packages/infra/` as a new workspace package that manages remote Cloudflare state via flat per-command entry scripts (`bun run infra:status`, `infra:apply`, `infra:teardown`). Cloudflare API access goes through raw `fetch()` behind a single `cf<T>()` helper — no SDK dependency.**

Key invariants captured in the package's CLAUDE.md:

- **Sole-boundary pattern.** Only `src/lib/cloudflare-client.ts` calls `fetch()`; only `src/lib/wrangler-adapter.ts` will call `Bun.spawn` (when that adapter lands). Enforced by `sole-boundary.test.ts` which greps `src/**/*.ts`.
- **Declarative manifest.** `src/infra.config.ts` is the single source of truth for desired remote state; providers reconcile reality to match.
- **Dry-run default.** `apply` prints a plan and exits 0 unless `--yes` is passed. Destructive `teardown` requires `--force`.
- **Per-resource split between CLI and wrangler.** The CLI handles what Cloudflare requires API-driven management for: D1 database creation, R2 bucket creation, Worker-scoped secret push, zone-level DNS records outside the Custom Domain path. For resources wrangler already manages cleanly (Custom Domain attachment via `routes: [{ custom_domain: true }]` in `wrangler.jsonc`; Durable Object migrations), the CLI defers — the provider becomes status-only (reads via API) plus `teardown`. This split avoids the footguns of reinventing wrangler's work (e.g. the Custom Domain API requires an `environment` field that only resolves cleanly with explicit `[env.X]` blocks, which imposes ongoing binding-duplication cost on `wrangler.jsonc`).
- **Secrets will never transit in-memory state.** When the secrets provider is added, values will stream from `op read` stdout directly into `wrangler secret put` stdin via a `Blob` wrap (`Bun.spawn` rejects raw strings with a cryptic `TypeError`).

## Options considered

- **Option A — `packages/infra/` + raw `fetch()` + flat per-command scripts (chosen).** Matches the repo's house style (flat `sync-secrets`, `gate`, `code-health` entries in `packages/dev-tools/`) and cleanly separates *local* dev env (existing `packages/dev-tools/`) from *remote* Cloudflare ops. Zero production deps today; `jsonc-parser` will be added when D1/R2 providers need to patch bindings in `wrangler.jsonc`.

- **Option B — Extend `packages/dev-tools/` with a `commands/cloudflare/` subdirectory.** Rejected because our dev-tools currently has three flat scripts with no dispatcher; adding a nested command family would require refactoring the existing scripts or tolerating two styles. The user has a clear mental split — "infra = remote, current secrets = local only" — and two packages reflect that.

- **Option C — Use the official `cloudflare` npm SDK instead of raw `fetch()`.** Rejected because our actual API surface is ~10 endpoints across all providers (custom domain, D1, R2, secret push, DNS lookup). The SDK's auto-generated surface area is more to mock than to call, and its transitive weight (deep `@cloudflare/*` tree) dwarfs a 50-line helper.

- **Option D — Terraform or Pulumi.** Industry-standard IaC. Rejected as overkill for a two-operator dogfood project with ~6 Cloudflare resources; the cognitive overhead (state file storage, apply semantics, provider compatibility) dwarfs the operation. Revisit if the resource graph grows past ~30 or a third operator joins.

## Consequences

- **Easier:** renaming or tearing down the app is a PR; new Cloudflare resources are one manifest entry + one provider; `infra:status` doubles as executable documentation of what exists; provider tests catch API-shape regressions before live deploys.
- **Harder:** the manifest and `wrangler.jsonc` must stay aligned (a forthcoming `wrangler-sync.ts` helper using `jsonc-parser` will own this when D1/R2 bindings need IDs patched in); a raw-fetch client means we hand-write types for CF responses — small cost for a small surface.
- **Re-evaluate** if:
  - Resource count grows past ~20 (Terraform becomes worth it).
  - We need state across more than one Cloudflare account concurrently.
  - Cloudflare ships a programmatic wrangler API that obviates the `wrangler-adapter.ts` boundary.

## Advice

Known wrangler + Cloudflare gotchas the CLI needs to design around when D1/R2/secrets providers land. The initial custom-domain-only change hits none of them, but they're recorded here so follow-up changes get them right the first time:

- **Custom Domain attachment belongs to wrangler, not the CLI.** Caught during the first live-attach attempt: `PUT /accounts/{id}/workers/domains` requires an `environment` field that only resolves to an existing environment on the Worker if the Worker was deployed with an explicit `[env.X]` block. Adopting env blocks solely to satisfy this API means redeclaring every binding inside `[env.production]` (they don't inherit) forever after. Wrangler's `routes: [{ pattern, custom_domain: true }]` does the same API call internally using whatever env name it just deployed under — zero friction for flat configs.
- `wrangler d1 list` default output is a human table. Always pass `--json` — otherwise `JSON.parse` blows up at runtime.
- `wrangler d1 migrations list/apply` silently runs against local Miniflare without `--remote`, giving an authoritative-looking empty plan.
- `Bun.spawn` rejects raw string stdin with `TypeError: stdio must be an array of 'inherit', 'pipe', ...`. Wrap string stdin in `new Blob([str])` inside `wrangler-adapter`.
- Extract D1 UUIDs from the `database_id = "<uuid>"` literal in `wrangler d1 create` output — not from the parent banner (`⛅️ wrangler X.Y (update available A.B)` produces a false-match).
- Run wrangler with `cwd = dirname(wrangler config path)`; config-aware commands (`secret put`, migrations) silently fail from the repo root.
- 1Password field paths are case/hyphen-sensitive — copy the existing `op://gc-erp/...` refs verbatim; don't re-canonicalize to camelCase.

## Related

- [packages/infra/CLAUDE.md](../../packages/infra/CLAUDE.md) — package-scoped invariants.
- [docs/guides/ARCHITECTURE.md](../guides/ARCHITECTURE.md) — repo layout + deployment; updated in the same change as this ADR.
- [ADR 0001](0001-product-is-an-mcp-server.md) — the product is an MCP server; the infra CLI exists to provision what hosts it.
