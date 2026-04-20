# Retro draft — queue of topics for future retros

One-liners only. Date prefix, terse, enough context to be readable later without this session. See [CLAUDE.md](CLAUDE.md) for the two-fold pattern (queue here; Max initiates the actual retro).

Pruned when the entry has been addressed in a dated retro (or explicitly dropped). Otherwise append-only.

## Open

- 2026-04-20 — GitHub web-UI conflict editor writes a merge commit, breaking rebase-merge on this rebase-merge-only repo. Hit on PR #37's `bunfig.toml` conflict — recovered via local rebase + `push --force-with-lease`. Same shape as the PR #30 landmine that motivated [rebase-merge-everywhere](2026-04-19-post-m2-hygiene.md). Consider codifying "resolve conflicts locally, not on github.com" as an agent convention in [CLAUDE.md](../../CLAUDE.md).
- 2026-04-20 — `better-sqlite3` NODE_MODULE_VERSION mismatch hit 3× on `slice/cost-entry-form` in ~24h (last during M3 integration pre-push). `bun install --force` clears each time. `.nvmrc` pin from commit 611348a exists but the bootstrap loop isn't honoring it consistently. Durability fix before M4; `--force` as third-time band-aid isn't acceptable as the standing answer.
- 2026-04-20 — M3 fan-out shape (PR #36 server wire-up + PR #37 view scaffold + integration commit 646efd8) worked cleanly — two worktree agents on a pinned wire contract + one coordinator-owned integration commit = right cadence for a seam-separable feature. Worth explicit capture in [session-workflow.md](../guides/session-workflow.md) as a reusable template for M4 (`job_dashboard`) and M5 (`pay_app_preview`).
