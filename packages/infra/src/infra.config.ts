/**
 * Infra manifest — declarative desired state for remote Cloudflare resources.
 *
 * Mirrors the shape of packages/dev-tools/src/secrets.config.ts: the project
 * facts (worker name, hostname, zone) are baked here; nothing per-developer.
 */

export interface CustomDomainSpec {
  hostname: string;
  zone: string;
}

export interface D1Spec {
  databaseName: string;
}

export interface R2Spec {
  bucketName: string;
}

export interface InfraConfig {
  worker: { name: string };
  customDomain: CustomDomainSpec;
  d1: D1Spec;
  r2: R2Spec;
}

export const infra: InfraConfig = {
  worker: { name: "gc-erp-mcp-server" },
  customDomain: {
    hostname: "gc.leiserson.me",
    zone: "leiserson.me",
  },
  // NOTE: resource names are permanent once provisioned — confirm with Max before
  // running `infra:apply --yes` for the first time.
  d1: {
    databaseName: "gc-erp",
  },
  r2: {
    bucketName: "gc-erp-documents",
  },
};
