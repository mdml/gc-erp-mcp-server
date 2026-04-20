---
type: ADR
id: "0013"
title: "`apps/*` for user-facing shipping units; `packages/*` for internal libraries"
status: proposed
date: 2026-04-20
---

## Context

Every workspace in the repo today lives under `packages/*`: `mcp-server` (the Cloudflare Worker that deploys), `database`, `dev-tools`, `infra`, `agent-config`. That was fine when the only "user-facing shipping unit" was the Worker — a single deployable hidden among internal libraries — and no one inspecting the layout had to reach for a classification rule.

Two forcing functions now make the single-bucket layout inverted:

1. **[ADR 0014](0014-mcp-apps-sdk.md) adopts `@modelcontextprotocol/ext-apps`** for M3 and later. The cost-entry form (and M4's `job_dashboard`, M5's `pay_app_preview`) builds into a single-file HTML bundle that the Worker inlines at build time — not an independently deployed artifact, but a user-facing shipping unit whose source needs a home. If the form's source lives at `packages/cost-entry-form/`, it sits in the same directory as `database` and `dev-tools` despite being categorically different.
2. **Turborepo's default read is `apps/*` = deployables, `packages/*` = libraries.** The retro ([post-M2 hygiene](../retros/2026-04-19-post-m2-hygiene.md)) considered following that literal convention but landed on a narrower read: for this repo, `apps/*` means *user-facing shipping units* — the Worker plus the UI bundles embedded in it — and `packages/*` means *internal libraries consumed only by other workspaces*. The cost-entry-form's UI bundle fits "user-facing shipping unit" even though it doesn't deploy standalone.

Leaving `mcp-server` at `packages/mcp-server/` while scaffolding `apps/cost-entry-form/` would split user-facing shipping units across both directories based on "does it run `wrangler deploy`" — an operational distinction that says nothing about what the workspace *is*.

## Decision

**`apps/*` holds user-facing shipping units; `packages/*` holds internal libraries. Move `packages/mcp-server/` → `apps/mcp-server/` as the first commit of [M3's `slice/cost-entry-form`](../product/milestones.md#m3).** Future UI bundles (`apps/cost-entry-form/` in M3, `apps/job-dashboard/` in M4, `apps/pay-app-preview/` in M5) land under `apps/*` from their first commit.

The existing four library packages (`database`, `dev-tools`, `infra`, `agent-config`) stay under `packages/*` unchanged.

## Options considered

- **A (chosen): `apps/*` = user-facing shipping units, `packages/*` = internal libraries.** Move `mcp-server/`; new UI bundles land under `apps/` directly. Keeps the classification stable as M4/M5 add more app bundles.
- **B (rejected): Status quo — everything under `packages/*`.** Works today. Breaks the moment `packages/cost-entry-form/` ships alongside `packages/database/` with no structural hint that one is a user-facing shipping unit and the other is an internal library. The cost of the inversion compounds with each new app.
- **C (rejected): `apps/*` only for independently deployed Workers; UI bundles live in `packages/*`.** Follows Turborepo's literal convention. Rejected because the UI bundles are *the user-facing surface* M3/M4/M5 ship — relegating them to "internal library" misclassifies their purpose. The operational "deploys standalone?" test is the wrong axis.
- **D (rejected): Defer until a second independently deployed Worker exists.** Plausible: wait until (say) a Clerk webhook Worker forces `apps/mcp-server/` + `apps/webhook/`, then move. Rejected because M3's `apps/cost-entry-form/` lands *this sprint* — deferring means shipping the inverted layout, then moving under schedule pressure later. Doing the move now, while `apps/` is empty, is cheap; doing it with M4/M5 apps already in `packages/` is churn.

## Consequences

**Easier:**

- **Classification rule is stable.** New workspace → one question ("does a human ever see this, directly or via the Worker?") answers `apps/` vs `packages/`. No per-case deliberation.
- **Deploy graph is the `apps/*` filter.** `turbo run deploy --filter='./apps/*'` (once wired) captures exactly the shipping set, without per-workspace flags.
- **M4 / M5 app scaffolding is mechanical.** Copy the `apps/cost-entry-form/` shape; no layout decision to re-litigate.

**Harder:**

- **One-time churn to move `packages/mcp-server/` → `apps/mcp-server/`.** Files that must update in the same commit: root `package.json` `workspaces` glob (add `apps/*`); `.worktreeinclude` if any entry path-matches `packages/mcp-server/`; `CLAUDE.md` § "Repo shape"; `docs/guides/ARCHITECTURE.md`; any import that uses a relative path across package boundaries (Turbo name-based filters survive — `--filter=@gc-erp/mcp-server` is unaffected).
- **`turbo.json` audit** for any task config that paths at `packages/mcp-server/**` explicitly rather than via workspace name.
- **`packages/mcp-server/CLAUDE.md`** moves with the package to `apps/mcp-server/CLAUDE.md`; cross-references in other CLAUDE.md files get updated in the same commit.

**What triggers re-evaluation:**

- A workspace arrives that doesn't cleanly fit either bucket — e.g., a shared UI component library used by multiple apps but never shipped standalone. That's a signal to introduce a third bucket (likely still under `packages/` as a sub-library), not to redefine the existing buckets.
- If `apps/*` starts accumulating non-user-facing tooling (migrations runners, data import scripts) to dodge a classification argument, the convention has drifted — revisit.

## Advice

The move was surfaced in the [post-M2 hygiene retro](../retros/2026-04-19-post-m2-hygiene.md) and explicitly deferred to this ADR rather than landed as a standalone refactor — the retro's framing was that the convention earns its keep alongside M3's first app, not as a speculative cleanup.

[Spike 0001](../spikes/0001-mcp-apps-sdk.md) and [`docs/guides/mcp-apps.md`](../guides/mcp-apps.md) (the POC-verified vendor guide) independently arrived at the `apps/<name>/` layout for UI bundles — the scope-noun naming rule from [`packages/CLAUDE.md`](../../packages/CLAUDE.md) extends cleanly to `apps/*`.
