/**
 * Custom Domain provider — status + teardown.
 *
 * Attach is deliberately wrangler's responsibility via `custom_domain: true`
 * in `packages/mcp-server/wrangler.jsonc` routes — `wrangler deploy` sends the
 * right `PUT /accounts/{id}/workers/domains` with an `environment` value that
 * matches however it just deployed the Worker. Reinventing that here would
 * force an `[env.production]` block in wrangler.jsonc just to satisfy the
 * API's `environment` field.
 *
 * This provider therefore:
 *   - reads state via `GET /accounts/{id}/workers/domains` (for `status`)
 *   - plans a noop or a "wrangler will attach on next deploy" pointer
 *   - detaches via `DELETE` (for `teardown` — ad-hoc, fast; to prevent
 *     re-attach on the next deploy, also remove the routes entry from
 *     wrangler.jsonc before deploying)
 *
 * Drift (hostname attached to a different Worker) still throws from `plan`
 * rather than auto-reconciling; that's a human question.
 */

import type { InfraConfig } from "../infra.config";
import { accountPath, cf } from "../lib/cloudflare-client";

export interface WorkerDomain {
  id: string;
  zone_id: string;
  zone_name: string;
  hostname: string;
  service: string;
  environment: string;
}

export type CustomDomainStatus =
  | { kind: "attached"; id: string; hostname: string; service: string }
  | { kind: "missing"; hostname: string; service: string }
  | {
      kind: "drift";
      existing: WorkerDomain;
      expected: { hostname: string; service: string };
    };

export type CustomDomainAction =
  | { kind: "noop"; hostname: string; reason: string }
  | { kind: "wrangler-attach"; hostname: string; reason: string };

async function listCustomDomains(params: {
  hostname?: string;
}): Promise<WorkerDomain[]> {
  const query = new URLSearchParams();
  if (params.hostname) query.set("hostname", params.hostname);
  const qs = query.toString();
  const suffix = qs ? `/workers/domains?${qs}` : "/workers/domains";
  const result = await cf<WorkerDomain[] | null>("GET", accountPath(suffix));
  return result ?? [];
}

export async function checkCustomDomain(
  config: InfraConfig,
): Promise<CustomDomainStatus> {
  const { hostname } = config.customDomain;
  const service = config.worker.name;

  const existing = await listCustomDomains({ hostname });
  const match = existing.find((d) => d.hostname === hostname);
  if (!match) return { kind: "missing", hostname, service };
  if (match.service !== service) {
    return {
      kind: "drift",
      existing: match,
      expected: { hostname, service },
    };
  }
  return { kind: "attached", id: match.id, hostname, service };
}

export async function planCustomDomain(
  config: InfraConfig,
): Promise<CustomDomainAction> {
  const status = await checkCustomDomain(config);
  const { hostname } = config.customDomain;
  const service = config.worker.name;

  switch (status.kind) {
    case "attached":
      return {
        kind: "noop",
        hostname,
        reason: `already attached (id=${status.id})`,
      };
    case "missing":
      return {
        kind: "wrangler-attach",
        hostname,
        reason:
          "declared in wrangler.jsonc routes; `bun run deploy` will attach",
      };
    case "drift":
      throw new Error(
        `drift: ${hostname} is attached to service "${status.existing.service}", ` +
          `expected "${service}". Detach via the Cloudflare dashboard and re-run.`,
      );
  }
}

/**
 * Kept for shape consistency with providers that have real `apply` work
 * (D1, R2, secrets when they land). For custom-domain both action kinds
 * are intentionally no-ops — the attach happens on `bun run deploy`.
 */
export async function applyCustomDomain(
  _action: CustomDomainAction,
): Promise<void> {
  return;
}

export async function teardownCustomDomain(
  config: InfraConfig,
): Promise<"detached" | "not-found"> {
  const status = await checkCustomDomain(config);
  if (status.kind === "missing") return "not-found";
  const id = status.kind === "attached" ? status.id : status.existing.id;
  await cf("DELETE", accountPath(`/workers/domains/${id}`));
  return "detached";
}
