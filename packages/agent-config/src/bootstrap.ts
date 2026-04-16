#!/usr/bin/env bun
/**
 * bootstrap — worktree first-run setup.
 *
 * Wired into lefthook `post-checkout`. A fresh `git worktree add …` leaves the
 * new working tree without `node_modules/`, `.envrc.enc`, `.dev.vars`, or
 * `.claude/settings.json`; this script re-materializes them.
 *
 * Steps:
 *   1. `bun install` — idempotent; fast if the lockfile is satisfied. This
 *      also fires the root `prepare` script, which itself runs
 *      install-agent-config, so step 2 below is usually a no-op re-run.
 *   2. `turbo run install-agent-config` — explicit re-run, cheap and defensive
 *      in case someone changes `prepare` later.
 *   3. `turbo run sync-secrets` — gated on `.envrc.enc` missing. When it
 *      runs, an `op` auth failure is fatal: we'd rather fail the checkout
 *      loudly than leave a half-set-up worktree.
 *
 * Post-checkout args (`{1} {2} {3}` in lefthook.yml) are `prev-HEAD`,
 * `new-HEAD`, and a branch-flag. We don't inspect them — `.envrc.enc`
 * presence is a more reliable "is this a fresh worktree?" signal than
 * HEAD equality, and it works for `git clone` too.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { die, findWorkspaceRoot, runInherit } from "./io";

async function step(label: string, cmd: string[], cwd: string): Promise<void> {
  console.log(`\nbootstrap: ${label}`);
  console.log(`  $ ${cmd.join(" ")}`);
  const { exitCode } = await runInherit(cmd, { cwd });
  if (exitCode !== 0) {
    die("bootstrap", `${label} failed (exit ${exitCode})`);
  }
}

async function main(): Promise<void> {
  const root = findWorkspaceRoot();
  const envrcEnc = join(root, ".envrc.enc");

  await step("installing dependencies", ["bun", "install"], root);

  await step(
    "installing .claude/settings.json",
    ["turbo", "run", "install-agent-config"],
    root,
  );

  if (!existsSync(envrcEnc)) {
    console.log(
      "\nbootstrap: .envrc.enc missing — syncing secrets from 1Password",
    );
    console.log(
      "  (requires an active `op` session; run `eval $(op signin)` first if this fails)",
    );
    await step("syncing secrets", ["turbo", "run", "sync-secrets"], root);
  } else {
    console.log(
      "\nbootstrap: .envrc.enc already present — skipping sync-secrets",
    );
  }

  console.log("\nbootstrap: done.");
}

if (import.meta.main) {
  main().catch((err) => {
    die("bootstrap", err instanceof Error ? err.message : String(err));
  });
}
