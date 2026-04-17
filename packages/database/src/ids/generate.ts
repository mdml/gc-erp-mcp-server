import { nanoid } from "nanoid";
import type {
  ActivationId,
  ActivityId,
  CommitmentId,
  CostId,
  JobId,
  NTPEventId,
  PartyId,
  ProjectId,
  ScopeId,
} from "../schema/ids";

/**
 * Entity ID generators. Format: `{prefix}_{nanoid21}`.
 *
 * Two IDs are content-addressed and intentionally omitted from this module:
 * - `DocumentId` = `doc_<sha256>` — lives in `src/documents/id.ts` (TODO).
 * - `PatchId`    = `pat_<sha256>` — lives in `src/patches/hash.ts`.
 *
 * Tests that need deterministic IDs pass explicit values; the generators here
 * are for the happy-path tool handlers.
 */

export const newProjectId = (): ProjectId => `proj_${nanoid()}` as ProjectId;
export const newJobId = (): JobId => `job_${nanoid()}` as JobId;
export const newScopeId = (): ScopeId => `scope_${nanoid()}` as ScopeId;
export const newActivityId = (): ActivityId => `act_${nanoid()}` as ActivityId;
export const newCommitmentId = (): CommitmentId =>
  `cm_${nanoid()}` as CommitmentId;
export const newActivationId = (): ActivationId =>
  `actv_${nanoid()}` as ActivationId;
export const newNTPEventId = (): NTPEventId => `ntp_${nanoid()}` as NTPEventId;
export const newCostId = (): CostId => `cost_${nanoid()}` as CostId;
export const newPartyId = (): PartyId => `party_${nanoid()}` as PartyId;
