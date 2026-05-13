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

## 4. Worktree bootstrap — Zed task (verified-by-docs)

Zed has exactly one documented task hook: `create_worktree` ([docs](https://zed.dev/docs/tasks)), which fires after Zed creates a new linked git worktree (CLI or UI modal). The task inlines the commands directly — no shared script — so the Zed-specific concerns (which env vars are set, what gets copied from where) stay in the Zed config:

**[`.zed/tasks.json`](../../.zed/tasks.json):**

```json
[
  {
    "label": "bootstrap new worktree",
    "command": "bash",
    "args": [
      "-c",
      "set -e; export PATH=\"$HOME/.bun/bin:/opt/homebrew/bin:$PATH\"; cd \"$ZED_WORKTREE_ROOT\"; cp -n \"$ZED_MAIN_GIT_WORKTREE/.env.local\" .env.local 2>/dev/null || true; cp -n \"$ZED_MAIN_GIT_WORKTREE/.env.keys\" .env.keys 2>/dev/null || true; bun install"
    ],
    "hooks": ["create_worktree"],
    "reveal": "always",
    "hide": "never"
  }
]
```

**Env vars Zed exposes to tasks** (verified-by-docs):

- `ZED_WORKTREE_ROOT` — the new worktree's root.
- `ZED_MAIN_GIT_WORKTREE` — the main repo's working dir. Equals `ZED_WORKTREE_ROOT` for normal (non-linked) checkouts.

The `cp -n` with `|| true` makes the copy step tolerant of missing source files (e.g. when the main worktree itself doesn't have `.env.local` set up yet). `bun install` is idempotent — a no-op when the lockfile is satisfied.

**Why `bash -c` (not `-lc`) + explicit `export PATH`:** Zed is a GUI app on macOS, so it inherits `launchd`'s PATH (no `~/.bun/bin`). An earlier version used `bash -lc` to get the login-shell PATH from `~/.bash_profile` / `~/.zshrc`, but that piped any verbose shell-init output (rvm, nvm, oh-my-zsh extras) into the task panel. Dropping `-l` and adding `export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"` to the command body keeps the panel clean and finds bun in both the default install location (`~/.bun/bin`) and the Homebrew location (`/opt/homebrew/bin`). If you installed bun somewhere else, edit the PATH export accordingly.

**`claude --worktree`** (the Claude Code CLI worktree flow) is handled separately by [`.worktreeinclude`](../../.worktreeinclude) (env-file copy) plus a `SessionStart` hook in [`.claude/settings.json`](../../.claude/settings.json) (`bun install`). Different launch path, different glue — no shared script. **Manual fallback** for any worktree spawned outside an agent harness: `just bootstrap`.

### Past iteration

Earlier versions of this section described a `scripts/bootstrap.sh` shared by Zed + Claude SessionStart + (briefly) lefthook post-checkout. That design embedded Zed-specific env-var lookups inside a "general" bootstrap script, and produced flaky Zed worktree spawns (1-in-N success rate). Inlining the Zed task and giving each launch path its own glue fixed the flake and removed the leaky abstraction. See [retros/draft.md](../retros/draft.md) for the lesson.

## 5. `.zed/` shape (verified-by-docs)

| File | Purpose |
|---|---|
| `.zed/tasks.json` | Project-local tasks. Currently: just the `create_worktree` bootstrap hook. |
| `.zed/settings.json` | Project-local Zed settings (themes, language servers, custom `agent_servers`, etc.). We don't have one yet — add only when something needs to differ from per-user settings. |

Personal Zed settings (themes, key bindings, default model for Zed Agent) live in the user's `~/.config/zed/settings.json` and are out of scope for this repo.

## 6. Trade-offs and known unknowns

- **Single task hook.** Zed currently documents only `create_worktree`. There's no `session_start` / `pre_thread` etc. If we want script-on-thread-start, that's an `extensions` / `agent_servers` configuration, not a task hook.
- **ACP adapter version drift.** Built-in adapters lag the vendor CLIs by some amount. If a Codex or Claude Code feature works in the standalone CLI but not in Zed's thread, suspect the adapter; fall back to running the CLI in a Zed terminal pane.
- **Task hook firing was the first live POC** and it found a bug (see §4's "Past bug" note). Corrected config landed in the same PR as the discovery; needs one more end-to-end run from a fresh Zed worktree post-merge to confirm. Fallback if it ever silently regresses: `just bootstrap` from a Zed terminal pane in the new worktree.

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
