/**
 * Declarative list of secrets required by gc-erp-mcp-server.
 *
 * Two categories:
 *
 *   - `teamSecrets` — shared across the team; the 1Password ref is a project
 *     fact (vault = gc-erp). `sync-secrets` fetches these by baked
 *     opRef and hard-fails if one cannot be resolved.
 *
 *   - `developerSecrets` — per-developer; the project declares only
 *     `{ name, description, targets }`, and each developer supplies their
 *     personal `op://` ref in `.env.op.local` (gitignored). Missing or
 *     unresolvable refs cause `sync-secrets` itself to warn-and-skip, but
 *     whether the *downstream* consumer tolerates the absence is the
 *     consumer's choice — see each secret's `description` for details.
 *
 * `sync-secrets` writes each secret to its listed targets:
 *   - 'envrc':    encrypted into /.envrc.enc (loaded into the shell by direnv)
 *   - 'dev-vars': plaintext into packages/mcp-server/.dev.vars (read by `wrangler dev`)
 */

export type SecretTarget = "envrc" | "dev-vars";

export interface TeamSecret {
  name: string;
  opRef: string;
  targets: SecretTarget[];
}

export interface DeveloperSecret {
  name: string;
  description: string;
  targets: SecretTarget[];
}

export const teamSecrets: TeamSecret[] = [
  {
    name: "CLOUDFLARE_API_TOKEN",
    opRef: "op://gc-erp/cloudflare/api-token",
    targets: ["envrc"],
  },
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    opRef: "op://gc-erp/cloudflare/account-id",
    targets: ["envrc"],
  },
  {
    name: "MCP_BEARER_TOKEN",
    opRef: "op://gc-erp/mcp-bearer/credential",
    targets: ["envrc", "dev-vars"],
  },
];

export const developerSecrets: DeveloperSecret[] = [
  {
    name: "CS_ACCESS_TOKEN",
    description:
      "Required to run the Code Health gate (pre-commit + pre-push). Requires a CodeScene seat.",
    targets: ["envrc"],
  },
  {
    name: "GH_TOKEN",
    description:
      "Personal GitHub token for CLIs that talk to the GitHub API (e.g. `gh`).",
    targets: ["envrc"],
  },
];
