import {
  type AnySQLiteColumn,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { JobId, ScopeId } from "./ids";
import { jobs } from "./jobs";

/**
 * ScopeSpec — Apple-tech-spec-style: WHAT is being built, not who builds it.
 * Rides as a JSON column; never queried by SQL predicates.
 */
export const ScopeSpec = z.object({
  materials: z
    .array(
      z.object({
        sku: z.string().optional(),
        description: z.string(),
        quantity: z.number().optional(),
        unit: z.string().optional(),
      }),
    )
    .default([]),
  installNotes: z.string().optional(),
  planRef: z.string().optional(),
  optionRef: z.string().optional(),
});
export type ScopeSpec = z.infer<typeof ScopeSpec>;

/**
 * Scope — SPEC §1. A tree per-Job. The scope tree IS the tech spec.
 * Tree invariants (parent.jobId == child.jobId; acyclicity) are pure
 * validators in `src/invariants/scopes.ts` — SQL can't express them.
 */
export const Scope = z.object({
  id: ScopeId,
  jobId: JobId,
  parentId: ScopeId.optional(),
  name: z.string(),
  code: z.string().optional(),
  spec: ScopeSpec.default({ materials: [] }),
});
export type Scope = z.infer<typeof Scope>;

export const scopes = sqliteTable("scopes", {
  id: text("id").$type<z.infer<typeof ScopeId>>().primaryKey(),
  jobId: text("job_id")
    .$type<z.infer<typeof JobId>>()
    .notNull()
    .references(() => jobs.id),
  parentId: text("parent_id")
    .$type<z.infer<typeof ScopeId>>()
    .references((): AnySQLiteColumn => scopes.id),
  name: text("name").notNull(),
  code: text("code"),
  spec: text("spec", { mode: "json" }).$type<ScopeSpec>().notNull(),
});

export const tables = { scopes };
