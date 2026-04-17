import type { IsoDate } from "../schema/common";
import type { PatchId } from "../schema/ids";
import type { CommitmentEdit } from "../schema/patches";

/**
 * Patch content-addressing — SPEC §1:
 *
 *   id = "pat_" + sha256(canonical(parentPatchId, edits, createdAt))
 *
 * Deterministic JSON canonicalization (keys sorted recursively) so the
 * same inputs produce the same id across runtimes. `author` and `message`
 * are intentionally NOT part of the hash input — SPEC says the id is a
 * function of parent + edits + createdAt only.
 */

export interface PatchHashInput {
  parentPatchId?: PatchId;
  edits: readonly CommitmentEdit[];
  createdAt: IsoDate;
}

export async function patchIdFor(input: PatchHashInput): Promise<PatchId> {
  const payload = {
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
