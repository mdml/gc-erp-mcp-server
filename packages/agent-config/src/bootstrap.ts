#!/usr/bin/env bun
/**
 * bootstrap — worktree first-run setup.
 *
 * Wired into lefthook `post-checkout`. A fresh `git worktree add …` leaves the
 * new working tree without `node_modules/` or `.claude/settings.json`; this
 * script re-materializes them.
 *
 * Steps:
 *   1. `bun install` — idempotent; fast if the lockfile is satisfied. This
 *      also fires the root `prepare` script, which itself runs
 *      install-agent-config, so step 2 below is usually a no-op re-run.
 *   2. `turbo run install-agent-config` — explicit re-run, cheap and defensive
 *      in case someone changes `prepare` later.
 *
 * Per ADR 0015 (dotenvx), per-developer secrets live in `.env.local` and
 * `.env.keys` at the repo root. Both are gitignored AND copied into fresh
 * worktrees by `.worktreeinclude`, so this hook does not need to materialize
 * them — by the time `bun install` runs, they're already in place.
 *
 * Post-checkout args (`{1} {2} {3}` in lefthook.yml) are `prev-HEAD`,
 * `new-HEAD`, and a branch-flag. We don't inspect them.
 */

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

  await step("installing dependencies", ["bun", "install"], root);

  await step(
    "installing .claude/settings.json",
    ["turbo", "run", "install-agent-config"],
    root,
  );

  console.log("\nbootstrap: done.");
}

if (import.meta.main) {
  main().catch((err) => {
    die("bootstrap", err instanceof Error ? err.message : String(err));
  });
}
