---
type: ADR
id: "0015"
title: "dotenvx replaces age + 1Password + direnv for secrets management"
status: active
date: 2026-04-28
---

## Context

Until this ADR, secrets in this repo flowed through four cooperating tools:

1. **1Password** as the source of truth (vault `gc-erp` for shared, per-developer items for personal).
2. **`packages/dev-tools/src/sync-secrets.ts`** — Bun script that ran `op read` against a baked list of refs and a per-developer `.env.op.local`.
3. **age** — encrypted the resulting dotenv body to the developer's own pubkey, producing `/.envrc.enc`.
4. **direnv** — auto-loaded `.envrc.enc` into every shell that `cd`'d into the repo, after a one-time `direnv allow`.

Plus a separate plaintext-on-disk file: **`apps/mcp-server/.dev.vars`**, which `wrangler dev` reads at startup. `sync-secrets` wrote both artifacts from the same `op read`.

This stack worked, but had three failure modes that consistently bit us:

- **`claude --worktree` first-run friction.** A fresh worktree sits without `.envrc.enc` until `turbo run sync-secrets` runs against an active `op` session. The orchestrating agent has no way to prompt 1Password's TouchID approval; the worktree first-run hook (`bootstrap.ts`) had to detect "is this a worktree?" and skip sync-secrets, relying on `.worktreeinclude` to copy the encrypted body in from the main checkout. This was load-bearing plumbing.
- **`direnv allow` is an interactive gate.** Every fresh worktree (and every machine setup) requires a human keystroke before any env var is visible — fine for humans, breaks parallel-agent flow.
- **Plaintext `.dev.vars` on disk.** `wrangler dev` accepts `vars` from `wrangler.jsonc` and `.dev.vars`; ours held `MCP_BEARER_TOKEN=dev` (a literal) plus, historically, real values like `CLERK_SECRET_KEY` for prod-mode local testing. The latter is a real plaintext-secret-on-disk, and the file's existence forced sync-secrets to be the synchronisation point.

The 2026-04 audit ([retro 2026-04-19-stytch-path-a-false-start.md] noted analogous friction in adjacent surfaces) made it clear that a per-process, no-shell-state secrets model would remove an entire class of "did the env load?" failures.

[`derna2`](https://github.com/elkebir-group/derna2) (sister project) had already migrated to dotenvx for the same reason and converged on a clean shape: per-developer keypair, per-process loading, no shell hook.

## Decision

**Replace the age + 1Password + direnv + `.envrc.enc` + `.dev.vars` stack with [dotenvx](https://dotenvx.com).** Each developer manages a per-developer `.env.local` (encrypted body, public-key header) and `.env.keys` (matching private key) at the repo root. Both gitignored. Decryption happens per-process via `bunx dotenvx run -f .env.local -- <cmd>`; the parent shell never holds plaintext.

**Drop `.dev.vars` entirely.** `MCP_BEARER_TOKEN: "dev"` (a public literal — local-bearer auth, not a secret) moves into [`apps/mcp-server/wrangler.jsonc`](../../apps/mcp-server/wrangler.jsonc) `vars`. Real secrets that prod-mode local testing might need (`CLERK_*`) come from `.env.local` via `bunx dotenvx run -f .env.local -- wrangler dev` when needed.

**Drop 1Password as project source of truth.** The two-operator team (Max + Salman) accepts the per-developer rotation cost: when a shared token rotates, exchange the new value out-of-band (Signal, 1Password share between just the two of us, etc.) and each developer re-runs `bunx dotenvx set NAME VAL -f .env.local` locally. 1Password remains useful as a personal password manager — it just stops being a `sync-secrets`-as-code dependency.

**Drop `sync-secrets.ts`, `secrets.config.ts`, the age/op helpers in `io.ts`, the `.envrc` direnv shim, and the `.env.op.local` ref-map convention.** No skeleton retained.

## Options considered

- **A (chosen): full dotenvx, drop 1Password as project SoT, drop `.dev.vars`.** Per-process loading, per-developer keypair, no shell hook. Removes all three failure modes above. Cost: each operator handles their own initial keypair + value-seeding once per machine; rotation costs an out-of-band message.
- **B: dotenvx + retain 1Password.** Rewrite `sync-secrets` to populate `.env.local` from `op read` instead of writing `.envrc.enc`. Preserves shared rotation but adds back the stack we're removing — `op` CLI prereq, sign-in, the interactive auth gate. Defeats the "remove first-run friction" goal.
- **C: keep `.dev.vars` as a regenerated artifact.** Keep a small script that decrypts `.env.local` and emits `.dev.vars`. Lets `wrangler dev` work the legacy way. Rejected because it reintroduces a plaintext-on-disk file; whatever lives there is then exfilable by anything that reads it. Per-process loading via `bunx dotenvx run -- wrangler dev` is the cleaner shape.
- **D: stay on age + 1Password + direnv.** Status quo. Three failure modes above are real; tolerating them costs more than the migration.

## Consequences

**Easier:**

- **`claude --worktree` first-run is silent.** `.env.local` and `.env.keys` are listed in [`.worktreeinclude`](../../.worktreeinclude); they materialize alongside the worktree. No bootstrap hook needs to know about secrets.
- **No shell-state surface.** No `direnv allow`, no `.envrc` shim, no decrypted env vars sitting in the parent shell waiting to be exfiled by `printenv` or environment-leaking subprocesses.
- **Plaintext-on-disk eliminated.** No `.dev.vars` file holds real values; the only on-disk secret material is the encrypted `.env.local` body and the matching `.env.keys` private key (both gitignored, both per-developer).
- **Wrangler config self-contained.** Local-mode `MCP_BEARER_TOKEN` is in `wrangler.jsonc` `vars` — committed, visible, public. No "where does this come from?" lookup.
- **Lefthook hooks gain a clean wrapper.** `bunx dotenvx run -f .env.local -- bun run code-health …` injects `CS_ACCESS_TOKEN` into one subprocess and exits.

**Harder:**

- **No central rotation.** A rotated `CLOUDFLARE_API_TOKEN` requires each operator to re-run `bunx dotenvx set` locally. Acceptable at two operators; revisit if the team grows.
- **Onboarding requires out-of-band token transfer.** A new developer can't `op signin` and sync-secrets themselves into a working state; they need the four shared values delivered to them. README documents the flow.
- **Wrangler deploys must be wrapped.** `wrangler deploy` and `wrangler secret put` need explicit `bunx dotenvx run -f .env.local --` prefixes to inherit `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`. Ergonomic cost: one prefix.

**Trigger for re-evaluation:**

- A third operator joins the dogfood team and the per-developer rotation cost compounds. At that point, option B becomes worth the friction — but it's a decision for that moment, not now.
- dotenvx publishes a security advisory or stops being maintained. Migration off would land us back at age + ECIES territory, which is a known fallback shape.

## Advice

The audit-and-fork was driven by Max in the 2026-04-28 session that produced this ADR. The reference shape is `derna2`'s implementation (and its sibling `dogtag`'s), which had been running for ~two weeks at the time of this decision.

**An initial attempt to skip the bash wrapper failed.** First-cut lefthook config pointed at `bunx dotenvx run -f .env.local -- bun run code-health <files>` (TS-driven). Two commits in, the pre-commit hook hung indefinitely with ~90 minutes of CPU on a single `dotenvx` node process and no `cs` subprocess descendants visible. Most likely cause: lefthook's parallel-hook execution + `Promise.all(files.map(checkFileHealth))` spawning multiple `cs` subprocesses concurrently from inside a deep bun-child tree triggered some lock-contention path in either bun or `cs`. Reverted to the derna2/dogtag pattern: one bash script ([`scripts/codescene.sh`](../../scripts/codescene.sh)) that uses `bunx dotenvx get` to extract `CS_ACCESS_TOKEN` and `export`s it at the bash level, then runs `cs check` directly. Lefthook calls the script in a sequential `for f in $files; do …; done` loop. Stable, fast, matches the upstream pattern.

The TypeScript code-health surface (`packages/dev-tools/src/code-health.ts` + `runCodeHealthCheck` in `gate/checks.ts`) was deleted as part of this ADR's implementation; `bun run code-health` is now `bash scripts/codescene.sh gate-all`. Coverage exclusions in `packages/dev-tools/vitest.config.ts` were trimmed accordingly.
