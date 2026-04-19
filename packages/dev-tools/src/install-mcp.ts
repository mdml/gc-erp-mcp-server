/**
 * `install:mcp:local` — patches `~/Library/Application Support/Claude/claude_desktop_config.json`
 * with a `gc-erp-local` MCP server entry that bridges Claude Desktop's stdio
 * transport to the local Worker (`http://localhost:8787/mcp`) via `mcp-remote`.
 *
 * Why an absolute path to npx: Claude Desktop on macOS inherits the
 * launch-services PATH (not the shell PATH). Bare `npx` may resolve to a stale
 * Node install — Node <18 crashes inside `mcp-remote`'s `wsl-utils` dep with
 * "module 'node:fs/promises' does not provide an export named 'constants'".
 * Pinning to `/opt/homebrew/bin/npx` (Homebrew node, stable across upgrades)
 * sidesteps PATH entirely. See [docs/guides/dogfood.md] §Node version caveat.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeAtomic } from "./io";

export const SERVER_NAME = "gc-erp-local";
export const LOCAL_MCP_URL = "http://localhost:8787/mcp";
export const LOCAL_BEARER = "Bearer dev";

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DesktopConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/**
 * Build the `gc-erp-local` server entry. The `${AUTH_HEADER}` indirection in
 * --header keeps `mcp-remote`'s argv parser happy (a bare "Bearer dev" with a
 * space confuses it on some Desktop versions).
 *
 * Why we set `PATH`: `npx` is a `#!/usr/bin/env node` script, so it
 * re-resolves `node` from PATH at runtime. Pinning `command` to
 * /opt/homebrew/bin/npx alone isn't enough — Desktop's inherited
 * launch-services PATH may still surface a stale nvm Node 16 first, and
 * Homebrew's npx will run on that. We explicitly seed PATH with the npx's
 * sibling bindir so `node`, `npm`, and any `#!/usr/bin/env node` shebang in
 * the spawned process tree resolves to the same Homebrew install.
 */
export function buildLocalEntry(npxPath: string): McpServerEntry {
  return {
    command: npxPath,
    args: [
      "-y",
      "mcp-remote",
      LOCAL_MCP_URL,
      "--header",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal string — mcp-remote performs the env-var substitution at runtime.
      "Authorization:${AUTH_HEADER}",
    ],
    env: {
      AUTH_HEADER: LOCAL_BEARER,
      PATH: `${dirname(npxPath)}:/usr/bin:/bin`,
    },
  };
}

/**
 * Insert/replace `mcpServers[name]` without touching other keys (preferences,
 * other servers). Returns a new object — does not mutate the input.
 */
export function patchConfig(
  existing: DesktopConfig,
  name: string,
  entry: McpServerEntry,
): DesktopConfig {
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      [name]: entry,
    },
  };
}

/**
 * Remove `mcpServers[name]` if present. Leaves the rest of the config alone.
 * If the entry doesn't exist, returns the input unchanged (idempotent).
 */
export function removeServer(
  existing: DesktopConfig,
  name: string,
): DesktopConfig {
  if (!existing.mcpServers || !(name in existing.mcpServers)) {
    return existing;
  }
  const { [name]: _removed, ...rest } = existing.mcpServers;
  return { ...existing, mcpServers: rest };
}

export function configPath(): string {
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
}

/**
 * Resolve an absolute path to a working `npx`. Prefers Homebrew (Apple Silicon
 * → Intel). Throws with a brew-install hint if none found. Does NOT fall back
 * to nvm — nvm versions are ordered lexicographically in Desktop's inherited
 * PATH and tend to surface ancient (Node 16) installs first.
 */
export function findNpx(): string {
  const candidates = ["/opt/homebrew/bin/npx", "/usr/local/bin/npx"];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Homebrew npx found at /opt/homebrew/bin/npx or /usr/local/bin/npx.\n" +
      "  install with: brew install node\n" +
      "  (mcp-remote requires Node ≥18; Homebrew's `node` formula is stable across upgrades, unlike nvm paths.)",
  );
}

function readConfig(path: string): DesktopConfig {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function backupPath(path: string): string {
  return `${path}.${Date.now()}.bak`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const remove = argv.includes("--remove");
  const path = configPath();
  const existing = readConfig(path);

  if (existsSync(path)) {
    writeAtomic(backupPath(path), readFileSync(path, "utf8"));
  }

  let next: DesktopConfig;
  if (remove) {
    next = removeServer(existing, SERVER_NAME);
  } else {
    const npx = findNpx();
    next = patchConfig(existing, SERVER_NAME, buildLocalEntry(npx));
    console.error(`install:mcp:local: pinned command to ${npx}`);
  }

  writeAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  console.error(
    `install:mcp:local: ${remove ? "removed" : "wrote"} ${SERVER_NAME} entry in ${path}`,
  );
  console.error("install:mcp:local: restart Claude Desktop to apply changes.");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(
      `install:mcp:local: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
}
