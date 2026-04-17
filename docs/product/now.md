# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M1 — Data model + MCP server skeleton + storage provisioning](milestones.md)

## Up next

1. **First non-trivial tools.** `create_job`, `list_jobs` (real), `ensure_activity` — see [TOOLS.md §3](../../TOOLS.md). Consumers of `packages/database`.
2. **Seed fixture.** `bun run seed:kitchen-fixture` populating the walkthrough job from [SPEC.md §2](../../SPEC.md) so dogfooding has something to render at M3/M4.
3. **First live D1 + R2 provision.** `bun run infra:apply --yes` from the main checkout — names `gc-erp` / `gc-erp-documents` confirmed. Then `turbo run deploy` to apply bindings.

## In flight

*(nothing yet)*

## Waiting on

- Max to pick the next open schema question worth resolving (see [backlog.md](backlog.md)).

## Recently done

- **M1 tasks 1–3 landed** on `feat/m1-data-model`: D1 + R2 providers (`packages/infra`), `packages/database` (SPEC §1 Zod + Drizzle, 12 tables, 99% cov, 22-activity seed), inline-review convention in root CLAUDE.md. See 2026-04-17 parallel-worktrees retro.
- Doc-landscape tightening: backlog as single open-items source, `now.md` + `retros/` conventions, [session-workflow guide](../guides/session-workflow.md). See [2026-04-17 retro](../retros/2026-04-17-doc-landscape.md).
- ADR 0003 (storage split) + TOOLS.md + Document schema. *(Pre-retros; see `git log`.)*
