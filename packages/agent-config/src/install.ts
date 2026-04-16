#!/usr/bin/env bun
/**
 * install — write `.claude/settings.json` from the composed policy.
 *
 * - Runs on every `bun install` via the root `prepare` script.
 * - Runs again on every worktree `post-checkout`, so a fresh worktree gets
 *   the full policy before the user opens Claude.
 * - Unconditionally overwrites `settings.json` — it is a build output.
 * - Deletes any lingering `settings.local.json` because the package is the
 *   single source of truth; a stray `.local` file would silently override
 *   the team policy.
 */

import { join } from "node:path";
import { die, findWorkspaceRoot, unlinkIfExists, writeAtomic } from "./io";
import { composeSettings, serializeSettings } from "./settings";

function main(): void {
  const root = findWorkspaceRoot();
  const claudeDir = join(root, ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  const settingsLocalPath = join(claudeDir, "settings.local.json");

  const body = serializeSettings(composeSettings());
  writeAtomic(settingsPath, body);

  const removed = unlinkIfExists(settingsLocalPath);

  console.log(`agent-config: wrote ${settingsPath}`);
  if (removed) {
    console.log(
      "agent-config: removed .claude/settings.local.json (policy now lives in packages/agent-config)",
    );
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    die(
      "agent-config/install",
      err instanceof Error ? err.message : String(err),
    );
  }
}
