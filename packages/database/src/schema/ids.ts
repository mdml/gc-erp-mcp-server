import type { z } from "zod";
import { brand } from "./common";

/**
 * Branded ID Zod schemas. Runtime validation is "non-empty string"; the brand
 * is a type-level discriminator so `JobId` is not assignable to `ScopeId`.
 * Generator helpers (`src/ids/generate.ts`) produce prefixed IDs —
 * `job_<nanoid21>`, `scope_<nanoid21>`, etc.
 */
export const ProjectId = brand("ProjectId");
export const JobId = brand("JobId");
export const ScopeId = brand("ScopeId");
export const ActivityId = brand("ActivityId");
export const CommitmentId = brand("CommitmentId");
export const ActivationId = brand("ActivationId");
export const NTPEventId = brand("NTPEventId");
export const CostId = brand("CostId");
export const PatchId = brand("PatchId");
export const PartyId = brand("PartyId");
export const DocumentId = brand("DocumentId");

export type ProjectId = z.infer<typeof ProjectId>;
export type JobId = z.infer<typeof JobId>;
export type ScopeId = z.infer<typeof ScopeId>;
export type ActivityId = z.infer<typeof ActivityId>;
export type CommitmentId = z.infer<typeof CommitmentId>;
export type ActivationId = z.infer<typeof ActivationId>;
export type NTPEventId = z.infer<typeof NTPEventId>;
export type CostId = z.infer<typeof CostId>;
export type PatchId = z.infer<typeof PatchId>;
export type PartyId = z.infer<typeof PartyId>;
export type DocumentId = z.infer<typeof DocumentId>;
