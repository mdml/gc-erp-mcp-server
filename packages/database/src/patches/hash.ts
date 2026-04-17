import type { IsoDate } from "../schema/common";
import type { JobId, PatchId } from "../schema/ids";
import type { CommitmentEdit } from "../schema/patches";

/**
 * Patch content-addressing — SPEC §1:
 *
 *   id = "pat_" + sha256(canonical(jobId, parentPatchId, edits, createdAt))
 *
 * Deterministic JSON canonicalization (keys sorted recursively) so the
 * same inputs produce the same id across runtimes.
 *
 * Hash contract (F2.1–F2.5 spike decisions):
 *   - `author` and `message` are NOT in the hash — SPEC §1.
 *   - `jobId` IS in the hash — self-describes the patch's job scope; cheap
 *     belt-and-suspenders against collision across jobs (F2.1).
 *   - `createdAt` is ms-precision IsoDate; single-operator assumption means
 *     same-ms collision is non-issue for v1 (F2.2). Revisit with concurrency.
 *   - `edits` array order is preserved — patches are narrative; order is
 *     intent (F2.3). Do NOT sort.
 *   - `Money.cents` is int; `Activation.throughput.units` is `z.number()`,
 *     float-reserialization edge case documented as theoretical (F2.4).
 *   - `undefined` and absent fields collapse in canonicalization (F2.5 test
 *     locks this — see hash.test.ts).
 */

export interface PatchHashInput {
  jobId: JobId;
  parentPatchId?: PatchId;
  edits: readonly CommitmentEdit[];
  createdAt: IsoDate;
}

export async function patchIdFor(input: PatchHashInput): Promise<PatchId> {
  const payload = {
    jobId: input.jobId,
    parentPatchId: input.parentPatchId ?? null,
    edits: input.edits,
    createdAt: input.createdAt,
  };
  const canonical = stableStringify(payload);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = toHex(new Uint8Array(digest));
  return `pat_${hex}` as PatchId;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeysDeep(v);
    return out;
  }
  return value;
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}
