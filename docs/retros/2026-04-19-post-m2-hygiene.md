---
date: 2026-04-19
slug: post-m2-hygiene
---

# Retro — post-M2 hygiene: slice prompts, vendor guides, merge convention

## Context

M2 landed to `main` via [PR #30](https://github.com/mdml/gc-erp-mcp-server/pull/30) earlier today. `draft.md` had accumulated 7 entries during the `feat/dogfood-prep` integration run — all dated 2026-04-19, all debrief-shaped. This retro folds them into decisions before M3 starts (first app via [spike 0001](../spikes/0001-mcp-apps-sdk.md) targeting `apps/cost-entry-form/`).

## Observations

- **Slice agents rewrote known-good invocations from memory twice.** PR #29 passed `CLERK_SECRET_KEY` via `wrangler dev --var KEY=VAL` (wrangler 4.x wants `KEY:VAL`) — the malformed flag echoed the live secret to stdout; rotation required. PR #29's deploy-checklist separately dropped the `(cd packages/mcp-server && …)` subshell pattern that `wrangler secret put` requires (needs the Worker's cwd to find `wrangler.jsonc`). Both are the same shape: agent regenerated an invocation it "knew" rather than copying the verified one.
- **"Connected" in claude.ai's Connector UI means auth works, not protocol works.** OAuth slice pre-flight 3 ate ~15 min of "why isn't claude.ai happy?" debugging because the handshake-gap isn't surfaced by the Connector UI's status label. `McpAgent` solves it for free in the real slice; the debugging cost was borne by the slice prompt not distinguishing auth-green from protocol-green.
- **We hit the vendor-assumption failure mode twice in a week.** Stytch false-start (half-day lost to a plan built on assumed DCR behavior — see [retro](2026-04-19-stytch-path-a-false-start.md)); `type: "http"` Claude Desktop claim in `dogfood.md` that wasn't actually supported (memory-scope correction). In both, the friction was "plan first, verify later" applied to a vendor we hadn't used before.
- **`install:mcp:prod` → Desktop → Clerk → `list_jobs` was never end-to-end smoke-tested for the M2 merge.** `dogfood.md` documented a 20+-line walkthrough for it. claude.ai web was the critical path.
- **PR #30 couldn't rebase-merge into `main`.** `feat/dogfood-prep` had accumulated two merge commits (`71904ce`, `978746a`) from child-PR merges; 3 days of downstream touches made local rebase resolve infeasible. Max toggled squash-merge on in `main`'s protection, squash-merged, toggled off. Repo-level settings still had merge+squash+rebase all enabled post-toggle, meaning the same shape can recur.
- **MCP Apps SDK adoption changes the `apps/` move calculus.** [Spike 0001](../spikes/0001-mcp-apps-sdk.md) scaffolds `apps/cost-entry-form/` in M3, `apps/job-dashboard/` in M4, `apps/pay-app-preview/` in M5. If `mcp-server` stays under `packages/`, we get the inverted convention: UI bundles (not independently deployed) under `apps/`, the only deployable runtime under `packages/`.
- **Coordinator-agent loop with inline `AskUserQuestion` checkpoints worked cleanly.** Pre-flight 1 confirmation, tunnel-vs-deploy choice for pre-flight 3, preflight cleanup — all resolved without round-trips back to Max. No decision needed; noting as validated practice.

## Decisions

- **New invariant in root [`CLAUDE.md`](../../CLAUDE.md) §Secrets: verify any CLI flag's exact syntax before routing a secret through it.** `--help` the flag first, confirm the shape, then pass the value. Preferred shapes are `.dev.vars` (local) or `wrangler secret put <NAME>` on stdin (prod). Cites the PR #29 leak.
- **New convention in root [`CLAUDE.md`](../../CLAUDE.md) §Agent Conventions: new vendor → disposable POC → [`docs/guides/<vendor>.md`](../guides/).** Before building against any vendor SDK / auth flow / API new to this repo: spend 30–60 min on a disposable POC against the vendor's *current* docs, then write a short vendor guide capturing what works, what the docs got wrong, and the minimal working shape. The ADR and slice cite the guide. The vendor-guide deliverable is the forcing function: you can't skip the POC if you owe the guide. Mirrored in [`docs/guides/session-workflow.md`](../guides/session-workflow.md) as a proactive pattern.
- **New verbatim-copy rule in [`docs/guides/dogfood.md`](../guides/dogfood.md) §Prod deploy checklist step 3.** Slices changing prod secret names must copy the two `(cd packages/mcp-server && bunx wrangler secret put …)` lines from dogfood.md verbatim — not rewrite them. The subshell pattern is load-bearing; training data sometimes suggests repo-root invocations that fail with "Required Worker name missing."
- **Trim Desktop-prod walkthrough from `dogfood.md`; flag unverified in README.** `install:mcp:prod` and `patch.ts`'s Clerk-shaped block stay (useful for discoverability). The long walkthrough in `dogfood.md` collapses to a ~5-line pointer with an "unverified end-to-end" callout. [`README.md`](../../README.md) §Connect from a client labels Desktop-prod *Unverified end-to-end*; claude.ai stays flagged as **the verified dogfood path**.
- **Rebase-merge is the only PR merge method, repo-wide** (not just on `main`). Repo settings: `allow_merge_commit=false`, `allow_squash_merge=false`, `allow_rebase_merge=true`. Applied to every branch, so integration branches like `feat/dogfood-prep` can't accumulate merge-commit child-PR artifacts that lock out the final rebase-merge into `main`. The "temporary toggle when genuinely needed" escape hatch stays identical to how it works for `main` today. Codified in root [`CLAUDE.md`](../../CLAUDE.md) §Git.
- **`apps/mcp-server/` move happens as the first commit of M3's `slice/cost-entry-form` work**, not as a standalone refactor. Turborepo convention becomes `apps/*` = user-facing shipping units (Worker + its UI views), `packages/*` = internal libs (database, dev-tools, infra, agent-config). ADR will ratify as part of the M3 slice scaffolding.
- **Pre-flight taxonomy (auth-green vs protocol-green) not separately codified.** The new vendor-guide convention absorbs it: a Clerk vendor guide would have documented the `McpAgent` handshake requirement before the slice, making the ambiguity impossible. No separate rule needed.
- **Coordinator + inline-`AskUserQuestion` pattern — confirmed good; no codification change.** Keep doing. Documented only here in case it drifts later.

## Actions taken

- Renamed branch `docs/retros-pre-m3` → `docs/retro-post-m2-hygiene` to match this retro's slug.
- Root [`CLAUDE.md`](../../CLAUDE.md): added §Secrets invariant on `--help`-before-secrets (PR #29 incident); added §Agent Conventions rule on new-vendor → POC → vendor guide; rewrote §Git `main`-only rebase-merge bullet into the repo-wide version with PR #30 incident rationale.
- [`docs/guides/dogfood.md`](../guides/dogfood.md) §Prod deploy checklist step 3: replaced `wrangler secret put …` ellipsis with the explicit `(cd packages/mcp-server && bunx wrangler secret put CLERK_{SECRET,PUBLISHABLE}_KEY)` invocations + callout against `--var`; added the verbatim-copy rule as a slice-facing callout.
- [`docs/guides/dogfood.md`](../guides/dogfood.md) §`install:mcp:prod`: collapsed the 20+-line walkthrough to a short pointer with an *"unverified end-to-end"* callout; deferred the verify-or-remove decision (see Deferred).
- [`docs/guides/session-workflow.md`](../guides/session-workflow.md): added a new "Working with a new vendor" section (POC → vendor guide → ADR + slice) with a backlink to the root CLAUDE.md convention; added a failure-mode bullet under "What tends to go wrong."
- [`README.md`](../../README.md) §Connect from a client: flagged claude.ai as the **verified** dogfood path; Desktop-prod as ***Unverified end-to-end*** with a pointer to the dogfood callout.
- Hygiene drift sweep: verified — nothing to prune. [`osv-scanner.toml`](../../osv-scanner.toml) entry `GHSA-67mh-4wv8-2f99` doesn't expire until 2026-07-17 and the "drizzle-kit is devDep-only" justification still holds (verified via `packages/database/package.json`). All five [`bunfig.toml`](../../bunfig.toml) `minimumReleaseAgeExcludes` entries are locked to versions published ≤4 days ago — nothing has aged out of quarantine yet.
- Pruned all 7 `draft.md` entries (6 rolled into decisions above; 1 — coordinator-loop — confirmed good with no change).

## Deferred

- **Flip GitHub repo-level merge settings manually.** The `gh api PATCH` failed (PAT lacks admin scope). Max to run: Settings → General → Pull Requests → uncheck "Allow merge commits" + uncheck "Allow squash merging"; keep "Allow rebase merging" checked. Verify after via `gh api repos/mdml/gc-erp-mcp-server --jq '{rebase,merge,squash}'` — expect `{"merge":false,"rebase":true,"squash":false}`.
- **`apps/mcp-server/` move + accompanying ADR.** Lands as the first commit of M3's `slice/cost-entry-form` slice, not a standalone refactor. Backlog this; ADR will follow the [`0000-template.md`](../decisions/0000-template.md) convention.
- **Verify `install:mcp:prod` end-to-end, or delete the Clerk-shaped block from `install-mcp/patch.ts`.** The short-term status is "documented-but-unverified with a clear warning"; the medium-term fork is do-the-smoke-test or remove. Defer until Desktop-prod becomes a real dogfood path (not M3-critical per project memory on [M3 dogfood sequencing](../product/backlog.md)).
