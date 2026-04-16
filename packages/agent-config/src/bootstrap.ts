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
 *   3. Secrets materialization — branches on whether this is a fresh
 *      `claude --worktree` run (`.git` is a file) or a main checkout:
 *        - Main checkout, `.envrc.enc` present → skip.
 *        - Main checkout, `.envrc.enc` missing → `turbo run sync-secrets`.
 *          `op` auth failure is fatal; better to loudly fail than leave a
 *          half-set-up repo.
 *        - Linked worktree → skip sync-secrets. `.worktreeinclude` at repo
 *          root runs AFTER this hook and copies `.envrc.enc`, `.dev.vars`,
 *          and `.env.op.local` in from the main checkout. Running
 *          sync-secrets here would hard-fail because those files aren't
 *          in place yet and there's usually no live `op` session.
 *
 * Post-checkout args (`{1} {2} {3}` in lefthook.yml) are `prev-HEAD`,
 * `new-HEAD`, and a branch-flag. We don't inspect them — the `.git`
 * file/dir check is a more reliable "is this a fresh worktree?" signal
 * than HEAD equality, and it works for `git clone` too.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { die, findWorkspaceRoot, runInherit } from "./io";

/**
 * Linked worktrees created by `git worktree add` have a `.git` *file*
 * (containing `gitdir: …/.git/worktrees/<name>`). Main checkouts have a
 * `.git` *directory*. Submodule worktrees also use a `.git` file, but this
 * repo has no submodules at the workspace root.
 */
function isWorktree(root: string): boolean {
  const gitPath = join(root, ".git");
  return existsSync(gitPath) && statSync(gitPath).isFile();
}

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

  if (existsSync(envrcEnc)) {
    console.log(
      "\nbootstrap: .envrc.enc already present — skipping sync-secrets",
    );
  } else if (isWorktree(root)) {
    console.log(
      "\nbootstrap: fresh worktree detected (`.git` is a file) — skipping sync-secrets.",
    );
    console.log(
      "  .worktreeinclude will copy .envrc.enc, .dev.vars, and .env.op.local",
    );
    console.log("  in from the main checkout once `git worktree add` returns.");
  } else {
    console.log(
      "\nbootstrap: .envrc.enc missing — syncing secrets from 1Password",
    );
    console.log(
      "  (requires an active `op` session; run `eval $(op signin)` first if this fails)",
    );
    await step("syncing secrets", ["turbo", "run", "sync-secrets"], root);
  }

  console.log("\nbootstrap: done.");
}

if (import.meta.main) {
  main().catch((err) => {
    die("bootstrap", err instanceof Error ? err.message : String(err));
  });
}
