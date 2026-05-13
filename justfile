# Vendor-portable command surface for the gc-erp-mcp-server repo.
# Recipes wrap the current bun / turbo invocations; harness-agnostic by design
# so Claude Code, Codex, or a human shell all hit the same verbs.
#
# See docs/decisions/0016-portability-layer-justfile-multi-harness.md and
# docs/product/scope/0-foundation.md (Slice A).

# Show the list of recipes.
default:
    @just --list

# Install workspace dependencies. Idempotent: bun install is a no-op when
# the lockfile is satisfied. Env-file copy in fresh worktrees happens via
# the launch-specific glue (Zed's create_worktree task, Claude Code's
# .worktreeinclude), not here.
bootstrap:
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
