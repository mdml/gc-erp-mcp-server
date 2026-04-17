import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { ProjectId } from "./ids";

/** Project Zod — SPEC §1. Intentionally thin. */
export const Project = z.object({
  id: ProjectId,
  name: z.string(),
  slug: z.string(),
});
export type Project = z.infer<typeof Project>;

export const projects = sqliteTable("projects", {
  id: text("id").$type<z.infer<typeof ProjectId>>().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const tables = { projects };
