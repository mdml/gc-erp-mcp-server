/**
 * Patterns that auto-run without prompting.
 *
 * Philosophy: allow the common agent loop — read code, edit files, run tests,
 * inspect git, create PRs. Writes that leave the machine (pushes, PR creation)
 * are allowed only on feature-branch targets that `main` branch protections +
 * the pre-push gate can catch.
 *
 * If a pattern feels ambiguous ("would I want a one-click confirm here?"),
 * leave it out — the default is ASK.
 */

// Conventional-commit prefixes the repo uses for feature branches.
// Pushes to `<prefix>/*` auto-allow; anything else (including `main`) stays ASK.
const FEATURE_BRANCH_PREFIXES = [
  "slice",
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "ci",
  "build",
  "style",
  "revert",
] as const;

const featurePushPatterns = FEATURE_BRANCH_PREFIXES.flatMap((prefix) => [
  `Bash(git push origin ${prefix}/*)`,
  `Bash(git push -u origin ${prefix}/*)`,
  `Bash(git push --set-upstream origin ${prefix}/*)`,
]);

export const bashAllow: readonly string[] = [
  // Filesystem read via shell (Read tool is implicitly allowed).
  "Bash(ls *)",
  "Bash(ls)",
  "Bash(tree *)",
  "Bash(tree)",
  "Bash(stat *)",
  "Bash(file *)",
  "Bash(wc *)",
  "Bash(which *)",
  "Bash(pwd)",

  // Filesystem writes — scaffolding new package dirs during a session.
  // Reversible (empty dirs) and low-radius. `rm -rf` / `rm -r` stay deny.
  "Bash(mkdir -p *)",
  "Bash(mkdir *)",

  // Git inspection (read-only).
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(git show*)",
  "Bash(git branch*)",
  "Bash(git blame*)",
  "Bash(git check-ignore*)",
  "Bash(git worktree list*)",
  "Bash(git rev-parse*)",
  "Bash(git remote -v*)",
  "Bash(git remote get-url*)",
  "Bash(git ls-files*)",
  "Bash(git config --get *)",
  "Bash(git stash list*)",

  // Git ref fetch (no working-tree or local-branch mutation — just updates
  // remote-tracking refs). Needed at session start to compare against
  // origin before picking a base-ref alignment strategy.
  // Split bare + space-arg form so `git fetchfoo` doesn't sneak through.
  "Bash(git fetch)",
  "Bash(git fetch *)",

  // Git local writes covered by branch protection + human review at push/merge.
  "Bash(git add *)",
  "Bash(git commit -m *)",
  "Bash(git commit -am *)",
  "Bash(git switch *)",
  "Bash(git checkout -b *)",
  "Bash(git stash*)",
  "Bash(git restore --staged *)",

  // Fast-forward-only merge — refuses if non-FF, so it can't discard local
  // commits. This is the safe alternative to `git reset --hard origin/<branch>`
  // for base-ref alignment in fresh worktrees. `git reset --hard` stays deny.
  "Bash(git merge --ff-only)",
  "Bash(git merge --ff-only *)",

  // Pushes to feature branches only (force variants live in deny).
  ...featurePushPatterns,

  // Monorepo tooling — bun scripts wired in package.json.
  // Individual scripts aren't enumerated; `bun run *` is broad by design and
  // the deny list holds the floor (prod deploys, infra apply/teardown).
  "Bash(bun install*)",
  "Bash(bun run *)",
  // `bun pm` surfaces are registry + local-graph introspection — read-only.
  // `view` hits the npm registry for version/time metadata; `ls` and `why`
  // walk the local install graph. None of these mutate bun.lock.
  // Bare + space-arg form keeps `bun pm views` / `bun pm lsall` from matching.
  "Bash(bun pm view)",
  "Bash(bun pm view *)",
  "Bash(bun pm ls)",
  "Bash(bun pm ls *)",
  "Bash(bun pm why)",
  "Bash(bun pm why *)",
  "Bash(bunx biome*)",
  "Bash(bunx vitest*)",
  "Bash(bunx commitlint*)",
  "Bash(bunx tsc*)",
  "Bash(bunx turbo*)",

  // Turbo tasks — everything except deploy (production, stays ASK).
  "Bash(turbo run lint*)",
  "Bash(turbo run typecheck*)",
  "Bash(turbo run test*)",
  "Bash(turbo run test:coverage*)",
  "Bash(turbo run dev*)",
  "Bash(turbo run sync-secrets*)",
  "Bash(turbo run install-agent-config*)",
  "Bash(turbo run tail*)",

  // gh CLI — read-only subcommands.
  "Bash(gh pr view*)",
  "Bash(gh pr list*)",
  "Bash(gh pr checks*)",
  "Bash(gh pr diff*)",
  "Bash(gh pr status*)",
  "Bash(gh issue view*)",
  "Bash(gh issue list*)",
  "Bash(gh run list*)",
  "Bash(gh run view*)",
  "Bash(gh workflow view*)",
  "Bash(gh workflow list*)",
  "Bash(gh repo view*)",
  "Bash(gh search*)",
  "Bash(gh api repos/*)",

  // gh CLI — writes covered by branch-protection + human review on merge.
  "Bash(gh pr create*)",
  "Bash(gh pr comment*)",
  "Bash(gh pr edit*)",
  "Bash(gh pr ready*)",
  "Bash(gh issue create*)",
  "Bash(gh issue comment*)",

  // Data inspection on stdout / files.
  "Bash(jq *)",
  "Bash(yq *)",
  "Bash(diff *)",
];

export const mcpAllow: readonly string[] = [
  // Context7 docs queries — read-only, goes to external docs mirror.
  "mcp__context7__query-docs",
  "mcp__context7__resolve-library-id",
  "mcp__plugin_context7_context7__query-docs",
  "mcp__plugin_context7_context7__resolve-library-id",

  // CodeScene — read-only code-health analysis.
  "mcp__codescene__code_health_review",
  "mcp__codescene__code_health_score",
  "mcp__codescene__explain_code_health",
  "mcp__codescene__explain_code_health_productivity",
  "mcp__codescene__analyze_change_set",
  "mcp__codescene__pre_commit_code_health_safeguard",
  "mcp__codescene__code_health_refactoring_business_case",

  // Playwright MCP — read-only observation of an already-open page.
  // Interaction + navigation tools (click, type, navigate, evaluate) stay ASK
  // so an agent can't silently steer the browser at sensitive URLs or read
  // DOM/localStorage/cookies without a prompt.
  "mcp__plugin_playwright_playwright__browser_snapshot",
  "mcp__plugin_playwright_playwright__browser_console_messages",
  "mcp__plugin_playwright_playwright__browser_take_screenshot",
  "mcp__plugin_playwright_playwright__browser_close",
  "mcp__plugin_playwright_playwright__browser_wait_for",
  "mcp__plugin_playwright_playwright__browser_resize",
];
