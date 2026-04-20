# CLAUDE.md — packages/database

Single source of truth for the gc-erp data layer. Zod schemas (domain types + invariants), Drizzle tables (SQL storage), typed D1 client, migrations, and seed scripts — all in one package so drizzle-kit, the Worker, and future consumers read the schema from the same place.

Per [ADR 0003](../../docs/decisions/0003-storage-split.md): domain state lives in D1, blobs in R2, session-only state in the `GcErpMcp` DO.

## The runtime / tooling split

This package has two halves that ship to different places. Keep them clean.

| Half | Where it runs | What's in it |
|---|---|---|
| **Runtime** — imported into the Worker bundle | Cloudflare Worker (`apps/mcp-server`) | `src/schema/`, `src/ids/`, `src/invariants/`, `src/client.ts`, `src/index.ts` |
| **Tooling** — runs outside the Worker, never bundled | `bun run` locally or in CI, `wrangler d1 migrations apply` at deploy | `src/migrations/` (SQL files), `src/seed/` |

Runtime code must not reach for `Bun.*`, `process.*`, or any Node-only API — it runs inside V8/workerd. Tooling code is free to use Bun APIs. Keep the halves from leaking: a seed script importing from `client.ts` is fine; `client.ts` importing from a seed script is a layering bug.

## What's here

```
src/
├── schema/              # drizzle tables + Zod domain schemas (runtime)
│   ├── common.ts        # Money, IsoDay, IsoDate, Duration, brand helper
│   ├── ids.ts           # branded ID Zod types (ProjectId, JobId, ...)
│   ├── projects.ts      # Project Zod + `projects` table
│   ├── jobs.ts          # Job Zod + `jobs` table
│   ├── parties.ts
│   ├── scopes.ts        # Scope (spec JSON column)
│   ├── activities.ts
│   ├── commitments.ts   # Commitment + Activation + commitment_scopes junction
│   ├── patches.ts       # Patch (edits JSON column)
│   ├── ntp-events.ts
│   ├── costs.ts         # Cost (source JSON column)
│   ├── documents.ts
│   └── index.ts         # barrel: re-exports schemas + flat `tables` record
├── ids/                 # runtime ID generators (prefix + nanoid21)
│   ├── generate.ts
│   └── index.ts
├── invariants/          # application-layer validators for constraints SQL can't express
│   ├── commitments.ts   # sum(pricePortion) == price.total | perUnit * estimatedUnits
│   ├── scopes.ts        # tree acyclicity; parent.jobId == child.jobId
│   ├── costs.ts         # scope.jobId == cost.jobId; commitment.jobId == cost.jobId
│   └── index.ts
├── patches/
│   └── hash.ts          # content-addressed `pat_<sha256>` computation
├── client.ts            # typed drizzle-D1 client factory (runtime)
├── migrations/          # drizzle-kit output (tooling; applied via `wrangler d1 migrations apply`)
├── seed/                # one-shot seed scripts (tooling)
│   ├── data/            # pure data arrays (activities library, etc.)
│   ├── activities.ts    # idempotent upsert of the 22-item library (TOOLS.md §7)
│   └── run.ts           # CLI entry
└── index.ts             # top-level barrel
```

## Invariants

- **SPEC.md §1 is the contract for Zod schemas.** Zod shapes here must match SPEC verbatim. If SPEC changes, the Zod schema changes in the same PR. Drizzle tables can evolve independently (JSON vs. flattened, normalized vs. embedded) as long as the Zod domain shape on read/write matches SPEC.
- **Activations are a separate table.** `Commitment` Zod carries `activations: Activation[]` (SPEC shape); storage normalizes into an `activations` table keyed by commitment. Reads assemble the nested shape.
- **Discriminated unions are JSON columns.** `Commitment.price` (PriceKind), `Cost.source` (CostSource), `Patch.edits` (CommitmentEdit[]), `Scope.spec` (ScopeSpec) all ride as JSON with a Zod `.parse()` gate on read. No flattened columns unless a future query pattern demands it.
- **Money is int cents; currency is implied.** SPEC locks v1 to USD. DB columns are `*_cents INTEGER NOT NULL`. On read, the consumer is responsible for reconstructing `{ cents, currency: "USD" }` before handing the row to any `Money`-expecting Zod schema — there's no `readCost` / `readCommitment` helper yet. Each call site that queries `amount_cents` / `price_portion_cents` does the lift itself until those helpers land alongside the first tools (`record_cost`, `list_costs`). Adding a `currency` column is a migration we take when multi-currency ships.
- **IDs are `{prefix}_{nanoid21}`.** One prefix per entity (`proj_`, `job_`, `scope_`, `act_`, `cm_`, `actv_`, `ntp_`, `cost_`, `pat_`, `party_`, `doc_`). `DocumentId` is the one exception: `doc_<sha256>` (content-addressed). `PatchId` is also content-addressed: `pat_<sha256>`. Generators live in `src/ids/generate.ts`; don't roll ad-hoc `crypto.randomUUID()` calls inline.
- **Append-only is a tool-layer discipline.** `costs` has no DB trigger preventing UPDATE/DELETE. Correctness lives in the `record_cost` tool (and this package's invariant validators) — not in D1. Same for patches.
- **Cross-entity invariants live in `src/invariants/`.** SQL FK + NOT NULL catches shape; things like "Cost.scopeId's Scope.jobId equals Cost.jobId", scope-tree acyclicity, and `sum(activation.pricePortion) == price.total` are pure functions that mcp-server calls before writing.
- **Migrations are additive.** Once a migration lands in `src/migrations/`, treat it as immutable — new changes go in new files. Editing an applied migration retroactively is a data-loss bug (matches the rule for DO migrations in `apps/mcp-server/CLAUDE.md`).

## Testing

Schema + invariants are pure. Drizzle queries run against an in-process better-sqlite3 with the same schema — drizzle's multi-driver story means one schema file works for D1 at runtime and sqlite in tests.

- **Round-trip tests per entity.** A valid SPEC example parses; the parsed output re-validates; writing it through drizzle and reading it back returns an equivalent shape.
- **Invariant tests for each validator.** Pass an entity, assert the validator accepts/rejects as expected. No DB fixture needed for pure validators; for ones that read siblings (scope-tree, cross-job FK), build the sibling set in-memory.
- **Seed idempotency.** Run the activity seeder twice against a fresh DB; assert `SELECT COUNT(*)` is identical and that no duplicate slugs exist.
- **Real D1 tests live in `apps/mcp-server`.** That's where the Worker + Miniflare is set up. Schema-level confidence comes from the better-sqlite3 integration here; end-to-end D1 confidence comes from integration tests alongside the tools that exercise the bindings.

## Don't add

- **`Bun.*` or Node APIs in `src/schema/` or `src/client.ts`.** Those modules run in the Worker. Tooling (`seed/`, migration helpers) can use Bun freely.
- **Sugar verbs in `src/`.** Pure schema + validators + client. Tools (e.g. `record_cost`) belong in `apps/mcp-server/src/tools/`. This package is the dependency, not the consumer.
- **A separate `types.ts` file.** Types are inferred from Zod (`z.infer<typeof Job>`) and re-exported from the schema file that owns them.
- **Multi-currency hedging.** Until there's a dogfood job in a non-USD currency, don't carry a `currency` column.
