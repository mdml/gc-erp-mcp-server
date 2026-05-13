# Codex — vendor guide

> **What to trust in this guide.** Written 2026-05-11 against [`@openai/codex`](https://github.com/openai/codex) v0.130.0 docs ([config-basic](https://developers.openai.com/codex/config-basic), [config-reference](https://developers.openai.com/codex/config-reference), [rules](https://developers.openai.com/codex/rules), [mcp](https://developers.openai.com/codex/mcp)). Configuration shapes are documented; end-to-end behavior in this repo is **unverified** — first Codex session here will be the live POC. Decision rationale lives in [ADR 0016](../decisions/0016-portability-layer-justfile-multi-harness.md).

## 1. What Codex is for in this repo

Codex is the **second agent harness**, beside Claude Code. Both work on the same Justfile-collapsed verb surface; both run inside Zed v1.0's Agent Panel (or standalone in a terminal). The point isn't to choose one — the point is to be able to fall over from either, or run them side by side.

Codex's primary differences worth knowing:
- **Token-prefix permission grammar** (not glob), via Starlark `.rules` files.
- **Trust-gate** on repo-local config — a footgun if you don't know about it.
- **Coarser approval policy** at the config layer; finer rules in Starlark.

## 2. Install + version

```bash
npm install -g @openai/codex     # or: brew install --cask codex
codex --version                  # currently 0.130.0
```

The CLI is the same artifact behind Zed's Codex adapter.

## 3. Config layout

| File | Scope | Purpose |
|---|---|---|
| `~/.codex/config.toml` | User-wide | Personal API keys, default model, global trust settings, anything that varies per-machine |
| `<repo>/.codex/config.toml` | Repo-local | Project policy knobs + MCP servers + hooks. **Loads only after trust prompt** (see §4) |
| `<repo>/.codex/rules/*.rules` | Repo-local | Fine-grained allow/forbid rules (Starlark). Codex's runtime auto-discovers files with the `.rules` extension only — `*.star` is ignored at runtime even though `execpolicy check --rules <path>` accepts any extension. |

In this repo the tracked files are:
- [`.codex/config.toml`](../../.codex/config.toml) — `approval_policy`, `sandbox_mode`, `[mcp_servers.*]`.
- [`.codex/rules/policy.rules`](../../.codex/rules/policy.rules) — token-prefix allow/forbid rules.

## 4. The trust gate (footgun)

**Repo-local `.codex/config.toml` does NOT load until the user accepts a trust prompt on Codex's first run in the repo.** Until then, only `~/.codex/config.toml` (user-wide) applies, plus default global policy.

This means: a fresh Codex install on Salman's machine, opened in this repo for the first time, will not have our rules in effect. Salman will see a trust prompt; he must accept it for our `.codex/config.toml` + `.codex/rules/policy.rules` to take effect.

After accepting trust, verify with the CLI validator. **Two non-obvious things about the syntax:** (1) `execpolicy check` always needs `--rules <path>` even when the rules file lives in the canonical `.codex/rules/` location — auto-discovery is runtime-only, not CLI-time; (2) the command must be passed as **unquoted argv tokens**, not a single quoted string, because the CLI uses `trailing_var_arg` clap parsing.

```bash
codex execpolicy check --rules .codex/rules/policy.rules just check
# → {"matchedRules":[{"prefixRuleMatch":{"matchedPrefix":["just"],"decision":"allow"}}],"decision":"allow"}

codex execpolicy check --rules .codex/rules/policy.rules git push origin main           # forbidden
codex execpolicy check --rules .codex/rules/policy.rules git push origin slice/foo      # allowed
codex execpolicy check --rules .codex/rules/policy.rules rm -rf .                       # forbidden
```

If any of those don't match expectations, the rules file has a syntax error (`execpolicy check` exits non-zero with a `failed to parse policy at <path>` message). Empty `matchedRules` means the file loaded fine but the command genuinely didn't match — usually a tokenization mistake (quoted argv) rather than a rule bug.

## 5. The `prefix_rule` grammar

Codex's permission rules are written in **Starlark** (Python-like, side-effect-free). Each `prefix_rule()` call is a token-prefix match against the command line.

```python
prefix_rule(
    pattern = ["git", "push", "origin", "main"],
    decision = "forbidden",
    justification = "Pushes to main go through PR + rebase-merge only.",
)
```

- **Token splitting:** the command line is split on whitespace AND shell separators (`&&`, `||`, `;`, `|`) before matching. Each shell-separated segment is matched independently. Scripts with redirection / substitution are treated as one opaque command.
- **Prefix match:** the rule matches if the first N tokens of the command equal the N tokens in `pattern`. Extra tokens after position N are unconstrained.
- **No globs.** `pattern = ["git", "push", "origin", "slice/*"]` does NOT mean "any slice/ branch" — it's a literal-token match against `slice/*`. To allow many branches under `slice/`, instead allow `["git", "push", "origin"]` (3 tokens) and rely on more-specific forbidden rules (e.g. `["git", "push", "origin", "main"]`) to block what should stay blocked. Decision priority is `forbidden > prompt > allow`, so the 4-token forbidden rule wins over the 3-token allow rule for `git push origin main` specifically.
- **Decisions:** `allow`, `prompt`, `forbidden`. Unmatched commands fall through to `approval_policy` in `config.toml`.

This is structurally different from Claude Code's glob-based `permissions.allow` / `permissions.deny`. We deliberately don't render both from a meta-policy — the grammars differ enough that the abstraction would leak. Each harness gets its own hand-maintained policy file (per [ADR 0016](../decisions/0016-portability-layer-justfile-multi-harness.md)).

## 6. MCP servers

Codex registers MCP servers via `[mcp_servers.<id>]` TOML blocks in `config.toml`. We mirror the [`/.mcp.json`](../../.mcp.json) servers that Claude Code uses (codescene, context7):

```toml
[mcp_servers.codescene]
command = "npx"
args = ["@codescene/codehealth-mcp"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp@latest"]
```

Same servers, different config shape — accepted asymmetry between vendors.

## 7. Hooks

Codex supports a richer hook set than Claude Code: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `SessionStart`, `UserPromptSubmit`, `Stop`. **We don't wire any of them.** Codex sessions in this repo are always launched inside an already-bootstrapped worktree (Zed's `create_worktree` task handles env-file copy + `bun install` before Codex starts), so a Codex-side hook would just duplicate work. Bare-terminal `codex` against a `git worktree add` not done via Zed falls back to `just bootstrap` manually.

## 8. Worktrees

No `codex --worktree` CLI flag. Two patterns work:

1. **Zed Agent Panel "New Worktree" UI** — creates a worktree + fires `create_worktree` task + launches a Codex thread in it. This is the primary path.
2. **`git worktree add` from a terminal**, then `cd <new-worktree> && codex` — Codex auto-detects repo root from `.git`, so it works in any worktree.

Per-worktree session isolation isn't a concern at our scale; if it becomes one, set `CODEX_HOME` to a worktree-specific dir before launching.

## 9. Trade-offs and known unknowns

- **First-run trust gate.** Surface this in onboarding; otherwise rules silently don't apply.
- **Adapter version drift in Zed.** If a CLI feature works standalone but not in Zed's thread, suspect the ACP adapter; fall back to `codex` in a Zed terminal pane.
- **No per-branch push allowlist.** Codex's `prefix_rule` grammar can't express "allow `slice/*` but forbid `main`" except via the forbid-overrides-allow pattern used here. If we later need finer pushes (e.g. forbid pushes to release branches), add more `forbidden` rules for the specific branch names.
- **`bun pm view/ls/why` etc. work today but go through `prompt` if the command grows new subcommands.** Acceptable — friction surfaces and we add rules.

## 10. Not in scope here

- **Per-user Codex config** (`~/.codex/config.toml`) — personal, not tracked.
- **OAuth flows for MCP servers** (`codex mcp login <name>`) — not used by codescene / context7 (both stdio).
- **`codex execpolicy` automation** beyond the validate-after-edit pattern above — nice-to-have, not load-bearing.

## Sources

- [openai/codex GitHub](https://github.com/openai/codex)
- [Config basics](https://developers.openai.com/codex/config-basic)
- [Config reference](https://developers.openai.com/codex/config-reference)
- [Rules + Starlark grammar](https://developers.openai.com/codex/rules)
- [MCP server config](https://developers.openai.com/codex/mcp)
- [Worktrees (Codex app)](https://developers.openai.com/codex/app/worktrees)
- [Native CLI worktree flags — open request](https://github.com/openai/codex/issues/12862)
