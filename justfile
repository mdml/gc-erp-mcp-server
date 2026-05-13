# Vendor-portable command surface for the gc-erp-mcp-server repo.
# Recipes wrap the current bun / turbo invocations; harness-agnostic by design
# so Claude Code, Codex, or a human shell all hit the same verbs.
#
# See docs/decisions/0016-portability-layer-justfile-multi-harness.md and
# docs/product/scope/0-foundation.md (Slice A).

# Show the list of recipes.
default:
    @just --list

# Install workspace deps; concurrent-safe (Zed-task + Claude-SessionStart fires).
bootstrap:
    #!/usr/bin/env bash
    # mkdir-lock: when a Zed-opened worktree also has Claude running inside it,
    # the `create_worktree` task and `SessionStart` hook both fire and race on
    # `bun install`, producing a half-linked node_modules (only top-level
    # binaries materialize). Past incident 2026-05-13. Env-file copy in fresh
    # worktrees is handled by the launch-specific glue (Zed's task body,
    # Claude's .worktreeinclude), not here.
    set -euo pipefail
    lock=".bootstrap.lock"
    trap 'rmdir "$lock" 2>/dev/null || true' EXIT
    tries=0
    until mkdir "$lock" 2>/dev/null; do
        if [ "$tries" -ge 600 ]; then
            echo "[bootstrap] stale lock after 10m — clearing" >&2
            rmdir "$lock" 2>/dev/null || true
        fi
        sleep 1
        tries=$((tries + 1))
    done
    bun install

# Full local gate — lint + typecheck + test + code-health.
check:
    bunx dotenvx run -f .env.local -- bun run gate

# Run the test suite across all workspaces.
test:
    bun run test

# Deploy the MCP server to Cloudflare (dotenvx wrap for CF creds).
deploy:
    bunx dotenvx run -f .env.local -- turbo run deploy
