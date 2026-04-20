# CLAUDE.md — packages/infra

Remote Cloudflare provisioning for gc-erp-mcp-server. Counterpart to `packages/dev-tools/`, which owns *local* dev env (1Password → `.envrc.enc` / `.dev.vars`). Infra owns *remote* state — custom domain, D1, and R2 today; Worker-side secrets will follow as the secrets provider lands. Never bundled into the runtime.

See [ADR 0002](../../docs/decisions/0002-infra-cli.md) for the full rationale.

## What's here

| File | Role |
|---|---|
| `src/infra.config.ts` | Declarative desired state (worker name, custom domain, D1, R2; secrets follow) |
| `src/lib/cloudflare-client.ts` | **Sole `fetch()` boundary** — `cf<T>()`, retry/backoff, `CloudflareApiError`, `accountPath` |
| `src/lib/wrangler-adapter.ts` | *(planned)* **Sole `Bun.spawn` boundary** — `runWrangler`, `runProcess`, string-stdin Blob wrap |
| `src/providers/*.ts` | One file per resource kind. Each exports `check` + `plan` + `apply` (+ `teardown` where applicable) |
| `src/status.ts` | Entry — per-resource green/red; `--json` for scripting |
| `src/apply.ts` | Entry — prints plan; `--yes` required to execute |
| `src/teardown.ts` | Entry — destructive; `--force` required |
| `src/sole-boundary.test.ts` | Greps `src/**/*.ts` for leaks past the boundary |

## Invariants

- **Sole-boundary pattern.** `fetch()` lives only in `lib/cloudflare-client.ts`; `Bun.spawn` lives only in `lib/wrangler-adapter.ts` (once it lands). Providers + command entries orchestrate — they do not reach past the boundary. Enforced by `sole-boundary.test.ts`. If that test fails, route through the helper; don't disable the check.
- **Dry-run by default, destructive opt-in.** `apply` without `--yes` is always a plan preview (exit 0, zero mutations). `teardown` without `--force` prints the intent and refuses.
- **Drift is a human question.** If a resource on Cloudflare differs from desired state in a way that isn't obvious to auto-fix (e.g. the hostname is already attached to a different Worker), providers throw with a clear message rather than silently overwriting. Reconcile manually, then re-run.
- **Defer to wrangler when it already manages the resource well.** The Custom Domain provider reads state via the API and handles `teardown` via `DELETE`, but the *attach* is wrangler's job (`routes: [{ pattern, custom_domain: true }]` in `apps/mcp-server/wrangler.jsonc`). When a new resource kind is added, first ask whether wrangler already owns it — if yes, the provider is status + teardown only. See [ADR 0002](../../docs/decisions/0002-infra-cli.md) for the rationale.
- **Auth from env, never cached.** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are read from `process.env` at call time. Loaded by direnv from 1Password (see [docs/guides/ARCHITECTURE.md §4](../../docs/guides/ARCHITECTURE.md)). No `wrangler login`, no OAuth cache.
- **Secrets will never land in memory state.** When the secrets provider is added, values stream from `op read` stdout directly into `wrangler secret put` stdin via a `Blob` wrap (`Bun.spawn` rejects raw strings with a cryptic `TypeError`). No temp files, no logs, no intermediate variables — same discipline as `packages/dev-tools/src/sync-secrets.ts`.
- **Manifest and `wrangler.jsonc` are complementary, not overlapping.** `infra.config.ts` declares resources; `apps/mcp-server/wrangler.jsonc` declares how the Worker binds to them. When the D1/R2 providers need to write binding IDs back (D1 `database_id`, R2 bucket name), they will use `jsonc-parser`'s `modify()` + `applyEdits()` to preserve comments and formatting — never regex-edit or regenerate the file.

## Testing

- **Mock at the sole boundaries.** `cloudflare-client.test.ts` stubs `globalThis.fetch`; `wrangler-adapter.test.ts` (when the adapter lands) will stub `globalThis.Bun.spawn`. Provider tests `vi.mock("../lib/cloudflare-client")` and never touch HTTP.
- **No live integration tests in the dev loop.** Tests never make real CF API calls. The validation that mocks match reality is the live-deploy session that follows a change — if a mock diverges, that session catches it and the mock gets corrected.
- **Coverage thresholds follow the project standard** (90 lines overall / 70 per-file). `status.ts`, `apply.ts`, `teardown.ts`, and `infra.config.ts` are excluded — they're thin dispatchers / declarative data. The meat (clients + providers) is covered directly.

## Don't add

- **Direct `process.exit` inside `run(argv)` functions.** Runners return a number; only the `if (import.meta.main)` block at the bottom of each entry calls `process.exit`. This keeps tests clean and composable.
- **Imperative wrangler usage from providers.** D1/R2 *creation* via wrangler is fine (the provider captures IDs and patches `wrangler.jsonc`); anything else — DNS, Custom Domain, secret writes where possible — goes through `cf()`.
- **A dispatcher/command framework.** Each top-level command is its own `bun run infra:<cmd>` entry with plain `process.argv` parsing. Matches the flat shape of `sync-secrets` / `gate` / `code-health` in `packages/dev-tools/`.

## Development

```bash
bun run infra:status                # read-only; exits 0 only if everything is OK
bun run infra:apply                 # prints the plan; exits 0 without mutating
bun run infra:apply --yes           # executes the plan
bun run infra:teardown --force      # destructive; detaches custom domain, deletes D1/R2 (+ later: removes secrets)
```

Prereqs: `direnv` loaded with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from 1Password. See [docs/guides/ARCHITECTURE.md §4](../../docs/guides/ARCHITECTURE.md) for the secrets flow.
