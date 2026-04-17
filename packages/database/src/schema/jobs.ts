import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { IsoDay } from "./common";
import { JobId, PartyId, ProjectId } from "./ids";
import { projects } from "./projects";

/** Job Zod — SPEC §1. Belongs to exactly one Project. */
export const Job = z.object({
  id: JobId,
  projectId: ProjectId,
  name: z.string(),
  slug: z.string(),
  address: z.string().optional(),
  clientPartyId: PartyId.optional(),
  startedOn: IsoDay.optional(),
});
export type Job = z.infer<typeof Job>;

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").$type<z.infer<typeof JobId>>().primaryKey(),
    projectId: text("project_id")
      .$type<z.infer<typeof ProjectId>>()
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    address: text("address"),
    // PartyId FK declared structurally; actual FK wired once parties.ts lands
    // in the same schema graph (see commitments for the pattern).
    clientPartyId: text("client_party_id").$type<z.infer<typeof PartyId>>(),
    // ISO-8601 calendar day; stored as TEXT.
    startedOn: text("started_on"),
  },
  (t) => ({
    // "Slug unique within project" (SPEC/TOOLS §3.1).
    slugPerProject: uniqueIndex("jobs_slug_per_project_unique").on(
      t.projectId,
      t.slug,
    ),
  }),
);

export const tables = { jobs };
