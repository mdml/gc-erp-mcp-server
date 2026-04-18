/**
 * Pure helpers for the `install:mcp:{local,prod}` CLIs.
 *
 * `install:mcp:local` writes an entry into
 * `~/Library/Application Support/Claude/claude_desktop_config.json`;
 * these helpers describe *what* to write / remove / render without
 * touching the filesystem. The CLI wrappers in `install-local.ts` and
 * `install-prod.ts` handle the read/backup/write plumbing.
 */

export const LOCAL_ENTRY_NAME = "gc-erp-local";
export const PROD_ENTRY_NAME = "gc-erp-prod";

export const LOCAL_ENTRY = {
  type: "http",
  url: "http://localhost:8787/mcp",
  headers: {
    // Fixed local token from .dev.vars — not a secret, by design
    // (docs/guides/dogfood.md §Bearer token story).
    Authorization: "Bearer dev",
  },
} as const;

/** Prod bearer is never interpolated — always the literal placeholder. */
export const PROD_BEARER_PLACEHOLDER = "<your MCP_BEARER_TOKEN>";

/**
 * Shape matches Claude Desktop's `claude_desktop_config.json`. Additional
 * top-level keys beyond `mcpServers` are preserved verbatim — we don't
 * own the whole file, only our entry inside `mcpServers`.
 */
export interface DesktopConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export function addLocalEntry(existing: DesktopConfig): DesktopConfig {
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      [LOCAL_ENTRY_NAME]: LOCAL_ENTRY,
    },
  };
}

export function removeLocalEntry(existing: DesktopConfig): DesktopConfig {
  const servers = { ...(existing.mcpServers ?? {}) };
  delete servers[LOCAL_ENTRY_NAME];
  return { ...existing, mcpServers: servers };
}

/** Sortable, filesystem-safe timestamp for the backup suffix. */
export function backupTimestamp(now: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

export function backupPath(configPath: string, now: Date): string {
  return `${configPath}.${backupTimestamp(now)}.bak`;
}

/** 2-space indent, trailing newline, insertion-order preserved. */
export function serializeConfig(config: DesktopConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Prints connection instructions for the deployed Worker. Currently only
 * Mac Claude Desktop's JSON-config path works — the in-app "Add custom
 * connector" UI on Desktop and Claude.ai (web + mobile) is OAuth-only,
 * with no bearer-token field. The server is bearer-only today, so those
 * surfaces are blocked until OAuth lands on the Worker. Tracked in
 * docs/product/backlog.md §Runtime / MCP.
 *
 * The bearer is always the literal placeholder — scripts must not
 * interpolate `$MCP_BEARER_TOKEN` (CLAUDE.md §Secrets). The user copies
 * the real token from 1Password `gc-erp` vault by hand.
 */
export function renderProdConnectionGuide(): string {
  const desktopBlock = JSON.stringify(
    {
      mcpServers: {
        [PROD_ENTRY_NAME]: {
          type: "http",
          url: "https://gc.leiserson.me/mcp",
          headers: {
            Authorization: `Bearer ${PROD_BEARER_PLACEHOLDER}`,
          },
        },
      },
    },
    null,
    2,
  );

  return [
    "gc-erp prod MCP — connection guide",
    "==================================",
    "",
    "Mac Claude Desktop  (only working path today)",
    "---------------------------------------------",
    "",
    "Paste the JSON block below into",
    "  ~/Library/Application Support/Claude/claude_desktop_config.json",
    `(alongside any existing ${LOCAL_ENTRY_NAME} entry) and replace the`,
    "placeholder with your MCP_BEARER_TOKEN from 1Password 'gc-erp' vault.",
    "Restart Claude Desktop after editing.",
    "",
    desktopBlock,
    "",
    'After restart: open a new conversation and ask Claude to "list my',
    'jobs" to confirm the connector is live.',
    "",
    "Claude.ai web + mobile  (not yet supported)",
    "-------------------------------------------",
    "",
    'The in-app "Add custom connector" UI on Claude.ai (web + iOS + Android)',
    "is OAuth-only — there is no bearer-token field, only OAuth Client ID +",
    "Secret. The server currently accepts only static bearer auth, so that",
    "flow fails. Adding OAuth (likely Cloudflare Workers OAuth Provider) is",
    "tracked in docs/product/backlog.md §Runtime / MCP.",
    "",
    "Until OAuth lands: Mac Claude Desktop is the only supported prod client.",
    "",
  ].join("\n");
}
