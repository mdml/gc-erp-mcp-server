/**
 * R2 provider — check / plan / apply / teardown.
 *
 * R2 buckets are API-provisionable. The list endpoint returns
 * `{ buckets: R2Bucket[] }` (nested, unlike D1's flat array). After `apply`,
 * the binding entry is written into apps/mcp-server/wrangler.jsonc.
 *
 * Binding shape written to wrangler.jsonc:
 *   r2_buckets: [{ binding: "DOCUMENTS", bucket_name: "..." }]
 */

import type { InfraConfig } from "../infra.config";
import { accountPath, cf } from "../lib/cloudflare-client";
import { patchWranglerJsonc } from "../lib/wrangler-patcher";

export interface R2Bucket {
  name: string;
  creation_date?: string;
}

export type R2Status =
  | { kind: "exists"; bucket: R2Bucket }
  | { kind: "missing"; bucketName: string };

export type R2Action =
  | { kind: "create"; bucketName: string }
  | { kind: "noop"; bucketName: string; reason: string };

export async function checkR2(config: InfraConfig): Promise<R2Status> {
  const { bucketName } = config.r2;
  const list = await cf<{ buckets: R2Bucket[] }>(
    "GET",
    accountPath("/r2/buckets"),
  );
  const bucket = (list?.buckets ?? []).find((b) => b.name === bucketName);
  if (!bucket) return { kind: "missing", bucketName };
  return { kind: "exists", bucket };
}

export async function planR2(config: InfraConfig): Promise<R2Action> {
  const status = await checkR2(config);
  const { bucketName } = config.r2;
  if (status.kind === "exists") {
    return { kind: "noop", bucketName, reason: "already exists" };
  }
  return { kind: "create", bucketName };
}

export async function applyR2(action: R2Action): Promise<void> {
  if (action.kind === "noop") return;
  // NOTE: Overwrites r2_buckets as a single-entry array. If infra.config.ts ever
  // holds >1 R2 spec, change patchWranglerJsonc here to merge-append, not replace.
  // NOTE: Partial-failure — if POST succeeds but patchWranglerJsonc throws, the bucket
  // exists in CF with no binding in wrangler.jsonc. Fix: add it manually, or teardown + re-apply.
  await cf("POST", accountPath("/r2/buckets"), { name: action.bucketName });
  patchWranglerJsonc([
    {
      path: ["r2_buckets"],
      value: [{ binding: "DOCUMENTS", bucket_name: action.bucketName }],
    },
  ]);
}

export async function teardownR2(
  config: InfraConfig,
): Promise<"deleted" | "not-found"> {
  const status = await checkR2(config);
  if (status.kind === "missing") return "not-found";
  await cf("DELETE", accountPath(`/r2/buckets/${status.bucket.name}`));
  return "deleted";
}
