# Codex permission rules for gc-erp-mcp-server.
#
# Pattern grammar: token-prefix matches. Tokens are split on whitespace
# and on shell separators (&&, ||, ;, |) before matching. Each rule's
# `pattern` is matched against the *first N tokens* of the command.
#
# Decision priority when multiple rules match: forbidden > prompt > allow.
# Anything not matched falls through to `approval_policy` in config.toml
# ("on-request" by default — prompts the user).
#
# Mirrors .claude/settings.json's permission philosophy: the verb surface
# is `just <recipe>`; everything below `just` is a justfile concern, not
# a policy concern.
#
# Validate after edits with: `codex execpolicy check '<command>'`.


# === Verb surface (primary) ===

prefix_rule(
    pattern = ["just"],
    decision = "allow",
    justification = "Justfile is the curated verb surface (ADR 0016).",
)


# === Read-only inspection ===

prefix_rule(pattern = ["ls"], decision = "allow")
prefix_rule(pattern = ["tree"], decision = "allow")
prefix_rule(pattern = ["pwd"], decision = "allow")
prefix_rule(pattern = ["stat"], decision = "allow")
prefix_rule(pattern = ["file"], decision = "allow")
prefix_rule(pattern = ["wc"], decision = "allow")
prefix_rule(pattern = ["which"], decision = "allow")
prefix_rule(pattern = ["jq"], decision = "allow")
prefix_rule(pattern = ["yq"], decision = "allow")
prefix_rule(pattern = ["diff"], decision = "allow")
prefix_rule(pattern = ["mkdir"], decision = "allow")


# === Git: read-only ===

prefix_rule(pattern = ["git", "status"], decision = "allow")
prefix_rule(pattern = ["git", "diff"], decision = "allow")
prefix_rule(pattern = ["git", "log"], decision = "allow")
prefix_rule(pattern = ["git", "show"], decision = "allow")
prefix_rule(pattern = ["git", "branch"], decision = "allow")
prefix_rule(pattern = ["git", "blame"], decision = "allow")
prefix_rule(pattern = ["git", "fetch"], decision = "allow")
prefix_rule(pattern = ["git", "rev-parse"], decision = "allow")
prefix_rule(pattern = ["git", "ls-files"], decision = "allow")
prefix_rule(pattern = ["git", "worktree", "list"], decision = "allow")
prefix_rule(pattern = ["git", "remote"], decision = "allow")
prefix_rule(pattern = ["git", "check-ignore"], decision = "allow")
prefix_rule(pattern = ["git", "config", "--get"], decision = "allow")
prefix_rule(pattern = ["git", "stash", "list"], decision = "allow")


# === Git: local writes ===

prefix_rule(pattern = ["git", "add"], decision = "allow")
prefix_rule(pattern = ["git", "commit"], decision = "allow")
prefix_rule(pattern = ["git", "switch"], decision = "allow")
prefix_rule(pattern = ["git", "stash"], decision = "allow")
prefix_rule(pattern = ["git", "restore"], decision = "allow")
prefix_rule(pattern = ["git", "mv"], decision = "allow")
prefix_rule(pattern = ["git", "rm"], decision = "allow")
prefix_rule(pattern = ["git", "checkout", "-b"], decision = "allow")
prefix_rule(pattern = ["git", "merge", "--ff-only"], decision = "allow")


# === Git push: feature branches allowed; main forbidden ===
# Forbidden rule (4 tokens) is more restrictive than allow rule (3 tokens);
# `forbidden > allow` precedence makes `git push origin main` blocked
# while `git push origin slice/3-foo` (and any other branch) passes.

prefix_rule(
    pattern = ["git", "push", "origin", "main"],
    decision = "forbidden",
    justification = "Pushes to main go through PR + rebase-merge only.",
)
prefix_rule(pattern = ["git", "push", "origin"], decision = "allow")


# === gh CLI ===

prefix_rule(pattern = ["gh", "pr", "view"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "list"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "checks"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "diff"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "status"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "create"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "comment"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "edit"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", "ready"], decision = "allow")
prefix_rule(pattern = ["gh", "issue", "view"], decision = "allow")
prefix_rule(pattern = ["gh", "issue", "list"], decision = "allow")
prefix_rule(pattern = ["gh", "issue", "create"], decision = "allow")
prefix_rule(pattern = ["gh", "issue", "comment"], decision = "allow")
prefix_rule(pattern = ["gh", "run"], decision = "allow")
prefix_rule(pattern = ["gh", "workflow", "view"], decision = "allow")
prefix_rule(pattern = ["gh", "workflow", "list"], decision = "allow")
prefix_rule(pattern = ["gh", "repo", "view"], decision = "allow")
prefix_rule(pattern = ["gh", "search"], decision = "allow")
prefix_rule(pattern = ["gh", "api", "repos"], decision = "allow")


# === bun pm introspection (read-only) ===

prefix_rule(pattern = ["bun", "pm", "view"], decision = "allow")
prefix_rule(pattern = ["bun", "pm", "ls"], decision = "allow")
prefix_rule(pattern = ["bun", "pm", "why"], decision = "allow")


# === Destructive: forbidden ===

prefix_rule(
    pattern = ["rm", "-rf"],
    decision = "forbidden",
    justification = "Recursive delete is unrecoverable.",
)
prefix_rule(pattern = ["rm", "-r"], decision = "forbidden")
prefix_rule(pattern = ["rm", "-fr"], decision = "forbidden")
prefix_rule(pattern = ["shred"], decision = "forbidden")

prefix_rule(pattern = ["git", "reset", "--hard"], decision = "forbidden")
prefix_rule(pattern = ["git", "clean", "-f"], decision = "forbidden")
prefix_rule(pattern = ["git", "clean", "-d"], decision = "forbidden")
prefix_rule(pattern = ["git", "clean", "-x"], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "--force"], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "-f"], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "--force-with-lease"], decision = "forbidden")
prefix_rule(pattern = ["git", "branch", "-D"], decision = "forbidden")
prefix_rule(pattern = ["git", "filter-branch"], decision = "forbidden")
prefix_rule(pattern = ["git", "filter-repo"], decision = "forbidden")
prefix_rule(pattern = ["git", "update-ref"], decision = "forbidden")
prefix_rule(pattern = ["git", "worktree", "remove"], decision = "forbidden")


# === Secret readers: forbidden ===

prefix_rule(
    pattern = ["cat", ".env.local"],
    decision = "forbidden",
    justification = "Encrypted dotenvx body — must not leave the repo (ADR 0015).",
)
prefix_rule(pattern = ["cat", ".env.keys"], decision = "forbidden")
prefix_rule(pattern = ["cat", ".env"], decision = "forbidden")
prefix_rule(pattern = ["printenv"], decision = "forbidden")
prefix_rule(pattern = ["env"], decision = "forbidden")
prefix_rule(pattern = ["gh", "auth", "token"], decision = "forbidden")


# === Production ops: forbidden ===
# All deploys go through `just deploy` (which uses dotenvx). Direct
# wrangler / turbo run deploy / bun run deploy / publish are blocked.

prefix_rule(pattern = ["wrangler", "login"], decision = "forbidden")
prefix_rule(pattern = ["wrangler", "logout"], decision = "forbidden")
prefix_rule(pattern = ["wrangler", "secret"], decision = "forbidden")
prefix_rule(pattern = ["wrangler", "deploy"], decision = "forbidden")
prefix_rule(pattern = ["turbo", "run", "deploy"], decision = "forbidden")
prefix_rule(pattern = ["bun", "run", "deploy"], decision = "forbidden")
prefix_rule(pattern = ["bun", "run", "infra:apply"], decision = "forbidden")
prefix_rule(pattern = ["bun", "run", "infra:teardown"], decision = "forbidden")
prefix_rule(pattern = ["npm", "publish"], decision = "forbidden")
prefix_rule(pattern = ["bun", "publish"], decision = "forbidden")


# === Remote shell ===
# `scp` and `ssh` always exfiltrate. `rsync` left at default (prompt)
# because rsync-to-local-path is legitimate and prefix_rule grammar
# can't distinguish local from remote destinations.

prefix_rule(pattern = ["scp"], decision = "forbidden")
prefix_rule(pattern = ["ssh"], decision = "forbidden")
