import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { IsoDate } from "./common";
import { DocumentId, JobId, PartyId } from "./ids";
import { jobs } from "./jobs";
import { parties } from "./parties";

/**
 * Document — SPEC §1. Content-addressed: id = "doc_" + sha256, R2 key
 * derived as `documents/<sha256>` (not stored). Identical bytes dedupe to
 * the same row.
 */
export const Document = z.object({
  id: DocumentId,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  mimeType: z.string(),
  originalFilename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: IsoDate,
  uploadedBy: PartyId.optional(),
  jobId: JobId.optional(),
  tags: z.array(z.string()).default([]),
});
export type Document = z.infer<typeof Document>;

export const documents = sqliteTable("documents", {
  id: text("id").$type<z.infer<typeof DocumentId>>().primaryKey(),
  sha256: text("sha256").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  uploadedBy: text("uploaded_by")
    .$type<z.infer<typeof PartyId>>()
    .references(() => parties.id),
  jobId: text("job_id")
    .$type<z.infer<typeof JobId>>()
    .references(() => jobs.id),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
});

/**
 * `doc_<sha256>` — the one correct way to mint a DocumentId. Mirrors
 * the content-addressing rule in SPEC §1.
 */
export function documentIdFor(sha256: string): z.infer<typeof DocumentId> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`documentIdFor: sha256 must be 64 lowercase hex chars`);
  }
  return `doc_${sha256}` as z.infer<typeof DocumentId>;
}

export const tables = { documents };
