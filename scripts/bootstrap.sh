#!/usr/bin/env bash
# Bootstrap a fresh checkout (clone or `git worktree add`):
# install JS deps. Idempotent — re-running on an already-bootstrapped
# tree is fast (bun no-op when nothing has changed).
#
# Usage:
#   bash scripts/bootstrap.sh              # bootstrap current directory
#   just bootstrap                         # equivalent
#   bash scripts/bootstrap.sh --force      # skip fast-path
#
# Optional environment:
#   BOOTSTRAP_ENV_SOURCE   directory to copy .env.local / .env.keys from
#                          (Zed's create_worktree task sets this via
#                          ZED_MAIN_GIT_WORKTREE; see .zed/tasks.json)
#
# Zed editor: invoked from .zed/tasks.json on the create_worktree hook.
# Claude Code `--worktree`: env files are copied via .worktreeinclude;
# this script can be run manually or wired into a SessionStart hook.

set -euo pipefail

# Zed runs tasks from a parent cwd; jump to the worktree root if it told us.
if [ -n "${ZED_WORKTREE_ROOT:-}" ]; then
  cd "$ZED_WORKTREE_ROOT"
fi

# Fast path: skip if everything is in place. Pass --force to re-run anyway.
# Makes the script cheap to call from a SessionStart hook.
if [ "${1:-}" != "--force" ] \
    && [ -d node_modules ] \
    && [ -d .claude ]; then
  exit 0
fi

# Copy env files from the main worktree if Zed's create_worktree task
# pointed us at one (or BOOTSTRAP_ENV_SOURCE was set explicitly), so
# dotenvx-backed recipes work in the new worktree without re-keying.
src="${BOOTSTRAP_ENV_SOURCE:-${ZED_MAIN_GIT_WORKTREE:-}}"
if [ -n "$src" ] && [ "$src" != "$PWD" ]; then
  cp -n "$src/.env.local" .env.local 2>/dev/null || true
  cp -n "$src/.env.keys" .env.keys 2>/dev/null || true
fi

echo "[bootstrap] bun install"
bun install

echo "[bootstrap] done"
