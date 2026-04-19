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

/**
 * Claude Desktop's `claude_desktop_config.json` only accepts stdio entries
 * — `type: "http"` (and similar streaming-transport shapes) is rejected as
 * "not a valid MCP server configuration" on current Desktop. We bridge via
 * the `mcp-remote` npm package, which proxies stdio↔HTTP + handles auth.
 *
 * Header encoding: `Authorization:${AUTH_HEADER}` (no space around the
 * colon) with the full `Bearer <token>` in the `env` section dodges the
 * Claude-Desktop-on-Windows / Cursor spaces-in-args bug. Mac tolerates the
 * space-ful form too, but this shape is portable. See mcp-remote docs:
 * https://github.com/geelen/mcp-remote#readme §Custom Headers.
 *
 * `-y` auto-accepts npx's first-run install prompt so Desktop doesn't
 * block waiting on user input.
 */
export const LOCAL_ENTRY = {
  command: "npx",
  args: [
    "-y",
    "mcp-remote",
    "http://localhost:8787/mcp",
    "--header",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal mcp-remote interpolation marker; env below fills AUTH_HEADER at spawn time
    "Authorization:${AUTH_HEADER}",
  ],
  env: {
    // Fixed local token from .dev.vars — not a secret, by design
    // (docs/guides/dogfood.md §Bearer token story).
    AUTH_HEADER: "Bearer dev",
  },
} as const;

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
 * Prints connection instructions for the deployed Worker. Prod uses Clerk
 * for OAuth 2.1 + DCR (see ADR 0012), so Claude Desktop, iOS, Android, and
 * claude.ai web all connect through the same flow — `mcp-remote` bridges
 * Desktop's stdio transport to the Worker's streamable HTTP endpoint and
 * handles the OAuth dance natively (DCR → browser consent hosted by Clerk
 * → cached token at `~/.mcp-auth/`, refreshed on expiry).
 *
 * No bearer is interpolated. The absolute `command` path + pinned `PATH`
 * works around Desktop's launch-services PATH not including Homebrew/nvm.
 */
export function renderProdConnectionGuide(): string {
  const desktopBlock = JSON.stringify(
    {
      mcpServers: {
        [PROD_ENTRY_NAME]: {
          command: "/opt/homebrew/bin/npx",
          args: ["-y", "mcp-remote", "https://gc.leiserson.me/mcp"],
          env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin" },
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
    "Mac Claude Desktop",
    "------------------",
    "",
    "Paste the JSON block below into",
    "  ~/Library/Application Support/Claude/claude_desktop_config.json",
    `(alongside any existing ${LOCAL_ENTRY_NAME} entry) and restart Claude`,
    "Desktop. On first connection `mcp-remote` pops a browser window to the",
    "Clerk-hosted consent page; sign in (or sign up) with the method you",
    "configured in Clerk's dashboard, then approve the scopes. No password",
    "or token to paste into Desktop.",
    "",
    desktopBlock,
    "",
    'After restart: open a new conversation and ask Claude to "list my',
    'jobs" to confirm the connector is live.',
    "",
    "Claude.ai web + iOS + Android",
    "-----------------------------",
    "",
    "Settings → Connectors → Add custom connector.",
    "  URL:  https://gc.leiserson.me/mcp",
    "  Auth: leave blank (OAuth handled in-app).",
    "",
    "On first connection claude.ai fetches the discovery document, registers",
    "itself via DCR, redirects to Clerk's hosted consent page, and caches",
    "the access token. Subsequent sessions refresh silently.",
    "",
  ].join("\n");
}
