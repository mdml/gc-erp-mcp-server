#!/usr/bin/env bash
# Wrapper around the `cs` CLI that sources CS_ACCESS_TOKEN from the
# dotenvx-encrypted .env.local before exec'ing cs.
#
# Why this exists: subprocesses spawned from bun (or other runtimes that
# decrypt dotenvx vars lazily into process.env) don't see the decrypted
# token in their native C-level environ. Shelling out through plain bash
# sidesteps that — bash `export` writes directly to the native environ
# that subprocesses inherit. Same pattern as `derna2`/`dogtag` (per ADR 0015).
#
# Also: cs ranks parallel invocations badly (lefthook + Bun.spawn
# Promise.all has been observed to deadlock). Each gate-check call spawns
# one cs subprocess; lefthook hooks call us in a sequential for-loop.
#
# Usage:
#   gate-check <file>        — run `cs check`, exit 1 if any warnings or if cs/token unavailable
#   gate-all                 — score every TS/JS file in the repo (whole-repo sanity check)
#   <anything else>          — pass-through to `cs`

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$REPO_ROOT/.env.local" ]]; then
  if CS_ACCESS_TOKEN="$(bunx dotenvx get CS_ACCESS_TOKEN -f "$REPO_ROOT/.env.local" 2>/dev/null)"; then
    export CS_ACCESS_TOKEN
  fi
fi

require_cs_and_token() {
  if ! command -v cs &>/dev/null; then
    echo "error: cs CLI not found — install with: npm i -g @codescene/codescene-cli" >&2
    exit 1
  fi

  if [[ -z "${CS_ACCESS_TOKEN:-}" ]]; then
    echo "error: CS_ACCESS_TOKEN not set — add it to .env.local via: bunx dotenvx set CS_ACCESS_TOKEN <token> -f .env.local" >&2
    exit 1
  fi
}

case "${1:-}" in
  gate-check)
    shift
    require_cs_and_token

    output=$(cs check "$@" 2>&1)
    printf '%s\n' "$output"
    if printf '%s\n' "$output" | grep -q "^warn:"; then
      exit 1
    fi
    exit 0
    ;;

  gate-all)
    require_cs_and_token

    # Walk apps/ + packages/ for source files. git ls-files would
    # auto-respect .gitignore but only sees tracked files; using `find`
    # also catches new untracked files that should already be staged.
    files=$(find apps packages \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' \) \
      ! -path '*/node_modules/*' \
      ! -path '*/dist/*' \
      ! -path '*/.turbo/*' \
      ! -path '*/coverage/*' \
      ! -path '*/.wrangler/*' \
      ! -path '*/.playwright-mcp/*' \
      | sort)

    failures=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      bash "$SCRIPT_DIR/codescene.sh" gate-check "$f" || failures=$((failures + 1))
    done <<< "$files"

    if [[ $failures -gt 0 ]]; then
      echo "" >&2
      echo "code-health: $failures file(s) below score 10" >&2
      exit 1
    fi
    echo ""
    echo "code-health: all files score 10"
    exit 0
    ;;

  *)
    exec cs "$@"
    ;;
esac
