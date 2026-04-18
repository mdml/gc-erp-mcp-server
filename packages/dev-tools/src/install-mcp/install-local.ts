#!/usr/bin/env bun
/**
 * CLI for `bun run install:mcp:local [--remove]`. Patches the
 * Claude Desktop config on macOS:
 *
 *   1. Read existing config (or `{}` if none exists).
 *   2. Back it up to `<config>.<YYYYMMDD-HHMMSS>.bak`.
 *   3. Add or remove the `gc-erp-local` entry.
 *   4. Write the updated file with 2-space indent + trailing newline.
 *   5. Remind the user to restart Claude Desktop.
 *
 * Mac-only — the hardcoded path mirrors Claude Desktop's on Mac. On
 * Windows/Linux this CLI exits with a clear message; we'll add the
 * other platforms when someone actually dogfoods on them.
 *
 * Excluded from coverage — pure logic (addLocalEntry, removeLocalEntry,
 * backupPath, serializeConfig) is tested in patch.test.ts.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  addLocalEntry,
  backupPath,
  type DesktopConfig,
  removeLocalEntry,
  serializeConfig,
} from "./patch";

function configPath(): string {
  if (process.platform !== "darwin") {
    console.error(
      `install:mcp:local — unsupported platform ${process.platform}. ` +
        "This script currently writes to the macOS Claude Desktop config " +
        "location only. Paste the entry from 'install:mcp:prod' into your " +
        "platform's equivalent file manually.",
    );
    process.exit(2);
  }
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
}

function readExistingConfig(path: string): DesktopConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DesktopConfig;
  } catch (err) {
    console.error(
      `install:mcp:local — failed to parse existing config at ${path}:`,
    );
    console.error(err instanceof Error ? err.message : String(err));
    console.error(
      "fix or delete the file, then re-run. Nothing was changed or backed up.",
    );
    process.exit(1);
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const remove = argv.includes("--remove");

  const path = configPath();
  const existing = readExistingConfig(path);

  if (existsSync(path)) {
    const bak = backupPath(path, new Date());
    copyFileSync(path, bak);
    console.log(`backed up → ${bak}`);
  }

  const next = remove ? removeLocalEntry(existing) : addLocalEntry(existing);
  writeFileSync(path, serializeConfig(next));
  console.log(
    remove
      ? `✓ removed gc-erp-local from ${path}`
      : `✓ wrote gc-erp-local → ${path}`,
  );
  console.log("Restart Claude Desktop to apply changes.");
  return 0;
}

process.exit(await main());
