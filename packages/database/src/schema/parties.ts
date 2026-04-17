import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { PartyId } from "./ids";

/**
 * Party — SPEC §1. People and orgs share the row shape; role (sub, client,
 * self) is implied by the commitment/job a Party is attached to, not a
 * field on the Party itself.
 */
export const Party = z.object({
  id: PartyId,
  kind: z.enum(["person", "org"]),
  name: z.string(),
  email: z.string().email().optional(),
});
export type Party = z.infer<typeof Party>;

export const parties = sqliteTable("parties", {
  id: text("id").$type<z.infer<typeof PartyId>>().primaryKey(),
  kind: text("kind", { enum: ["person", "org"] }).notNull(),
  name: text("name").notNull(),
  email: text("email"),
});

export const tables = { parties };
