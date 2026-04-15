/**
 * Declarative list of secrets required by gc-erp-mcp-server.
 *
 * `sync-secrets` reads this list, pulls each value from 1Password using its
 * opRef, then writes to the listed targets:
 *   - 'envrc':    encrypted into /.envrc.enc (loaded into the shell by direnv)
 *   - 'dev-vars': plaintext into packages/mcp-server/.dev.vars (read by `wrangler dev`)
 */

export type SecretTarget = "envrc" | "dev-vars";

export interface SecretSpec {
  name: string;
  opRef: string;
  targets: SecretTarget[];
}

export const SECRETS: SecretSpec[] = [
  {
    name: "CLOUDFLARE_API_TOKEN",
    opRef: "op://Shared-gc-erp/Cloudflare API Token/credential",
    targets: ["envrc"],
  },
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    opRef: "op://Shared-gc-erp/Cloudflare Account/account id",
    targets: ["envrc"],
  },
  {
    name: "MCP_BEARER_TOKEN",
    opRef: "op://Shared-gc-erp/MCP Bearer/credential",
    targets: ["envrc", "dev-vars"],
  },
];
