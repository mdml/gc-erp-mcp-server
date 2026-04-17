# Now — current sprint

Short, ordered. Updated at the start/end of each working session (see [retros](../retros/)). If a task moves, cross it off and note where it went. If this file grows past ~20 lines, prune — it's a working doc, not a log.

**Milestone:** [M1 — Data model + MCP server skeleton + storage provisioning](milestones.md)

## Up next

1. **Provision D1 + R2.** New providers in `packages/infra/`; bindings in `wrangler.jsonc`. Per [ADR 0003](../decisions/0003-storage-split.md).
2. **Stand up `packages/database`.** Drizzle schema + migrations + seed scripts; single source of truth imported by `packages/mcp-server`.
3. **Port [SPEC.md §1](../../SPEC.md) into code.** Zod on the domain side; drizzle on the DB side. Types live in `packages/database/src/schema/`.
4. **First non-trivial tools.** `create_job`, `list_jobs` (real), `ensure_activity` — see [TOOLS.md §3](../../TOOLS.md).
5. **Seed fixture.** `bun run seed:kitchen-fixture` populating the walkthrough job from [SPEC.md §2](../../SPEC.md) so dogfooding has something to render at M3/M4.

## In flight

*(nothing yet)*

## Waiting on

- Max to pick the next open schema question worth resolving (see [backlog.md](backlog.md)).

## Recently done

- Doc-landscape tightening: backlog as single open-items source, `now.md` + `retros/` conventions, [session-workflow guide](../guides/session-workflow.md). See [2026-04-17 retro](../retros/2026-04-17-doc-landscape.md).
- ADR 0003 (storage split) + TOOLS.md + Document schema. *(Pre-retros; see `git log`.)*
