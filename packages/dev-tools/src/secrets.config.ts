/**
 * Declarative list of secrets required by gc-erp-mcp-server.
 *
 * Three categories:
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
 *   - `localDevVars` — fixed literal values written to `.dev.vars` for local
 *     dev. NOT secrets — local D1 holds no real data, so e.g. the bearer
 *     token is a hardcoded `dev`. Listed here (not inlined in sync-secrets)
 *     for grep-ability and to keep all `.dev.vars` sources in one file.
 *     See [docs/guides/dogfood.md §Auth story].
 *
 * `sync-secrets` writes each secret to its listed targets:
 *   - 'envrc':    encrypted into /.envrc.enc (loaded into the shell by direnv)
 *   - 'dev-vars': plaintext into packages/mcp-server/.dev.vars (read by `wrangler dev`)
 *
 * `localDevVars` always writes to .dev.vars and overrides any team/dev secret
 * of the same name to enforce the "local stays local" invariant.
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
    // Prod token only flows to the shell env (via direnv). Local .dev.vars
    // gets the literal `dev` from `localDevVars` below — see file header.
    targets: ["envrc"],
  },
  {
    // Stytch OAuth project credentials (ADR 0010). envrc-only — local mode
    // is deliberately gated on the ABSENCE of STYTCH_PROJECT_ID, so these
    // must never land in .dev.vars.
    name: "STYTCH_PROJECT_ID",
    opRef: "op://gc-erp/stytch/project-id",
    targets: ["envrc"],
  },
  {
    name: "STYTCH_SECRET",
    opRef: "op://gc-erp/stytch/secret",
    targets: ["envrc"],
  },
];

/**
 * Fixed literal values written to packages/mcp-server/.dev.vars on every
 * `bun run sync-secrets`. NOT secrets — these are dev-only defaults that
 * exist in source. Local D1 holds no real data, so the bearer is hardcoded
 * `dev`. Adding a real prod-only secret here would be a bug.
 *
 * Overrides any team/dev secret of the same name (so even if MCP_BEARER_TOKEN
 * sneaks back into a `dev-vars` target by accident, local stays local).
 */
export const localDevVars: Record<string, string> = {
  MCP_BEARER_TOKEN: "dev",
};

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
