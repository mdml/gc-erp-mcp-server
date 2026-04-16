/**
 * Infra manifest — declarative desired state for remote Cloudflare resources.
 *
 * Mirrors the shape of packages/dev-tools/src/secrets.config.ts: the project
 * facts (worker name, hostname, zone) are baked here; nothing per-developer.
 *
 * Today declares only the Custom Domain. D1, R2, and Worker-scoped secrets
 * will land as additional fields + providers in follow-up changes.
 */

export interface CustomDomainSpec {
  hostname: string;
  zone: string;
}

export interface InfraConfig {
  worker: { name: string };
  customDomain: CustomDomainSpec;
}

export const infra: InfraConfig = {
  worker: { name: "gc-erp-mcp-server" },
  customDomain: {
    hostname: "gc.leiserson.me",
    zone: "leiserson.me",
  },
};
