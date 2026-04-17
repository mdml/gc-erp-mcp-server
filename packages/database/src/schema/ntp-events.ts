import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { activations } from "./commitments";
import { IsoDay } from "./common";
import { ActivationId, NTPEventId } from "./ids";

/**
 * NTPEvent — SPEC §1. Multiple NTPs allowed per activation (re-issue after
 * delay); the latest one is authoritative for schedule. Immutable — no
 * UPDATE; re-NTP by inserting a new row.
 *
 * Derived (not stored):
 *   startBy  = issuedOn + activation.leadTime
 *   finishBy = startBy   + activation.buildTime
 */
export const NTPEvent = z.object({
  id: NTPEventId,
  activationId: ActivationId,
  issuedOn: IsoDay,
  siteReady: z.boolean(),
  note: z.string().optional(),
});
export type NTPEvent = z.infer<typeof NTPEvent>;

export const ntpEvents = sqliteTable("ntp_events", {
  id: text("id").$type<z.infer<typeof NTPEventId>>().primaryKey(),
  activationId: text("activation_id")
    .$type<z.infer<typeof ActivationId>>()
    .notNull()
    .references(() => activations.id),
  issuedOn: text("issued_on").notNull(),
  siteReady: integer("site_ready", { mode: "boolean" }).notNull(),
  note: text("note"),
});

export const tables = { ntpEvents };
