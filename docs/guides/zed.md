# Zed — vendor guide

> **What to trust in this guide.** Written 2026-05-11 from Zed's public docs as of Zed 1.0 (released 2026-04-29). Not yet exercised end-to-end through a `create_worktree` hook firing inside Zed on this repo — that POC validation happens the first time someone uses the Agent Panel here. Sections labeled **verified-by-docs** are taken from official Zed documentation; sections labeled **unverified** are inferred and should be confirmed when first used.
>
> Decision rationale lives in [ADR 0016](../decisions/0016-portability-layer-justfile-multi-harness.md). This guide is the action-oriented "how Zed fits this repo."

## 1. What Zed is for in this repo

Zed v1.0 is our **agent host** — the launcher / orchestrator for parallel agent sessions. Same UI shape as Claude Code Desktop's parallel-agents flow, but with two differences that matter here:

- Multiple harnesses side-by-side (Claude Code *and* OpenAI Codex *and* others), each in its own thread.
- The IDE itself (editor, terminals, file tree) is in the same window as the agent panes.

Zed is *not* our AI model. We do not use Zed's own native AI assistant ("Zed Agent" thread type). See §3.

## 2. Agent Panel: launching Claude Code and Codex (verified-by-docs)

The **Agent Panel** ([docs](https://zed.dev/docs/ai/agent-panel)) hosts multiple parallel "threads." Each thread is one agent session with its own context window and history.

External agents integrate via the **Agent Client Protocol (ACP)** ([docs](https://zed.dev/docs/ai/external-agents)). Zed has built-in adapters for:

- **Claude Code** — Zed runs the Claude Agent SDK under the hood and communicates with Claude Code over ACP. ([blog](https://zed.dev/blog/claude-code-via-acp))
- **Codex** — Zed runs the Codex CLI and communicates over ACP.
- Plus Gemini CLI, GitHub Copilot, OpenCode, Cursor.

**Launch:** Agent Panel `+` button → "New Thread…" → pick the agent. The threads sidebar (`cmd-alt-j` on macOS) lists active threads; `ctrl-tab` cycles between them.

**Custom agents** can be added via `agent_servers` in `.zed/settings.json` — we don't currently need any beyond the built-ins.

## 3. The Zed-Agent boundary — what we don't use

The Agent Panel surfaces *two* thread types in the same UI:

| Thread type | What it is | Used here? |
|---|---|---|
| **Zed Agent** | Zed's own native loop, with Zed-managed tools + MCP servers + BYOK models (Claude Opus, DeepSeek-V4, etc.) | **No.** |
| **External agent** | An ACP-integrated vendor harness (Claude Code, Codex, …) | **Yes.** |

"Not using Zed for AI" concretely means: when starting a new thread, always pick an external agent. Leave Zed Agent's model picker / BYOK keys unconfigured. Zed orchestrates; the vendor's own loop runs the agent.

This boundary is intentional. Our work happens in the vendor harnesses we already trust (Claude Code, Codex). Zed contributes the multi-pane UI and the worktree task hook (§4) — not the agent loop.

## 4. Worktree bootstrap — Zed task + bootstrap script (verified-by-docs)

Zed has exactly one documented task hook: `create_worktree` ([docs](https://zed.dev/docs/tasks)), which fires after Zed creates a new linked git worktree (CLI or UI modal). We wire it to [`scripts/bootstrap.sh`](../../scripts/bootstrap.sh):

**[`.zed/tasks.json`](../../.zed/tasks.json):**

```json
[
  {
    "label": "bootstrap new worktree",
    "command": "bash",
    "args": [
      "-lc",
      "\"$ZED_MAIN_GIT_WORKTREE/scripts/bootstrap.sh\""
    ],
    "hooks": ["create_worktree"],
    "reveal": "always",
    "hide": "never"
  }
]
```

**Env vars Zed exposes to tasks** (verified-by-docs):

- `ZED_WORKTREE_ROOT` — the new worktree's root (current task cwd's worktree).
- `ZED_MAIN_GIT_WORKTREE` — the main repo's working dir. Equals `ZED_WORKTREE_ROOT` for normal (non-linked) checkouts.

The script reads `ZED_WORKTREE_ROOT` to `cd` into the new worktree, then copies `.env.local` / `.env.keys` from `ZED_MAIN_GIT_WORKTREE` (so dotenvx-backed recipes work without re-keying), then runs `bun install`. It's idempotent + has a fast-path so it's cheap to re-run.

`-lc` (login shell) is what makes `bun`, `turbo`, `cargo`, etc. discoverable on `PATH` inside Zed's task runner.

**Same script also serves `claude --worktree`** (the Claude Code CLI worktree flow): env files are copied via [`.worktreeinclude`](../../.worktreeinclude), and the script can be run manually or wired into a SessionStart hook in `.claude/settings.json`. One script, two launch paths.

## 5. `.zed/` shape (verified-by-docs)

| File | Purpose |
|---|---|
| `.zed/tasks.json` | Project-local tasks. Currently: just the `create_worktree` bootstrap hook. |
| `.zed/settings.json` | Project-local Zed settings (themes, language servers, custom `agent_servers`, etc.). We don't have one yet — add only when something needs to differ from per-user settings. |

Personal Zed settings (themes, key bindings, default model for Zed Agent) live in the user's `~/.config/zed/settings.json` and are out of scope for this repo.

## 6. Trade-offs and known unknowns

- **Single task hook.** Zed currently documents only `create_worktree`. There's no `session_start` / `pre_thread` etc. If we want script-on-thread-start, that's an `extensions` / `agent_servers` configuration, not a task hook.
- **ACP adapter version drift.** Built-in adapters lag the vendor CLIs by some amount. If a Codex or Claude Code feature works in the standalone CLI but not in Zed's thread, suspect the adapter; fall back to running the CLI in a Zed terminal pane.
- **Task hook firing is unverified.** First time someone creates a worktree in Zed here, watch the `reveal: "always"` panel to confirm `bootstrap.sh` actually fires and completes. If it doesn't, the fallback is `just bootstrap` from a Zed terminal pane in the new worktree.

## 7. Not in scope here

- **Authoring Zed extensions** — out of scope; we use built-in ACP adapters only.
- **Tuning Zed Agent thread settings** — we don't use that thread type (§3).
- **Per-user Zed config** — `~/.config/zed/settings.json` is personal, not committed.

## Sources

- [Zed 1.0 announcement](https://zed.dev/blog/zed-1-0)
- [Agent Panel docs](https://zed.dev/docs/ai/agent-panel)
- [External Agents docs](https://zed.dev/docs/ai/external-agents)
- [Tasks docs (hooks + env vars)](https://zed.dev/docs/tasks)
- [Claude Code in Zed (ACP)](https://zed.dev/blog/claude-code-via-acp)
