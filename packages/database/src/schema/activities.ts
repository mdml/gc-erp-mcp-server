import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { ActivityId } from "./ids";

/**
 * Activity — SPEC §1. Server-level shared taxonomy. Slug is the stable
 * identity operators type; display name is human-facing. Seeded on first
 * boot from the starter library (TOOLS.md §7) and grown via `ensure_activity`.
 */
export const Activity = z.object({
  id: ActivityId,
  name: z.string(),
  slug: z.string(),
  defaultUnit: z.string().optional(),
});
export type Activity = z.infer<typeof Activity>;

export const activities = sqliteTable("activities", {
  id: text("id").$type<z.infer<typeof ActivityId>>().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultUnit: text("default_unit"),
});

export const tables = { activities };
