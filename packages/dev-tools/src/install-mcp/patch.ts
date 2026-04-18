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
 * The prod config block is printed to stdout, never written to a file.
 * The bearer value is always the literal placeholder — scripts must not
 * interpolate `$MCP_BEARER_TOKEN` into any file or stdout stream (see
 * CLAUDE.md §Secrets). The user copies the block into their config and
 * substitutes the token by hand.
 */
export function renderProdConfigBlock(): string {
  const block = {
    mcpServers: {
      [PROD_ENTRY_NAME]: {
        type: "http",
        url: "https://gc.leiserson.me/mcp",
        headers: {
          Authorization: `Bearer ${PROD_BEARER_PLACEHOLDER}`,
        },
      },
    },
  };
  return `${JSON.stringify(block, null, 2)}\n`;
}
