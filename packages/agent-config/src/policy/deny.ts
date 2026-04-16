/**
 * Patterns that are blocked without a prompt.
 *
 * Two classes:
 *   1. Destructive (rm -rf, git reset --hard, branch -D, …) — can silently
 *      clobber work.
 *   2. Secret-exfil (cat .envrc.enc, printenv, gh auth token, …) — can leak
 *      credentials to the conversation transcript (and thus to Anthropic).
 *
 * DENY beats ALLOW in Claude Code, so these are a hard floor even if a future
 * allow pattern overlaps.
 */

export const bashDeny: readonly string[] = [
  // Destructive filesystem.
  "Bash(rm -rf*)",
  "Bash(rm -r*)",
  "Bash(rm -fr*)",
  "Bash(rm -f *)",
  "Bash(find * -delete*)",
  "Bash(shred*)",

  // Destructive git.
  "Bash(git reset --hard*)",
  "Bash(git clean -f*)",
  "Bash(git clean -d*)",
  "Bash(git clean -x*)",
  "Bash(git push --force*)",
  "Bash(git push -f*)",
  "Bash(git push --force-with-lease*)",
  "Bash(git branch -D*)",
  "Bash(git branch --delete --force*)",
  "Bash(git checkout --*)",
  "Bash(git checkout .*)",
  "Bash(git update-ref*)",
  "Bash(git filter-branch*)",
  "Bash(git filter-repo*)",
  "Bash(git worktree remove*)",

  // Secret readers (on-disk material or exfil primitives).
  "Bash(cat .envrc.enc*)",
  "Bash(cat .dev.vars*)",
  "Bash(cat .env*)",
  "Bash(cat *keys.txt*)",
  "Bash(cat ~/.config/sops/*)",
  "Bash(cat ~/.ssh/*)",
  "Bash(cat ~/.aws/*)",
  "Bash(printenv*)",
  "Bash(env)",
  "Bash(env *)",

  // Direct 1Password / age. Sync-secrets is the only sanctioned surface.
  "Bash(op read*)",
  "Bash(op item get*)",
  "Bash(op signin*)",
  "Bash(age -d*)",
  "Bash(age --decrypt*)",

  // Token leakers.
  "Bash(gh auth token*)",
  "Bash(gh auth status --show-token*)",

  // Production ops — deploys and prod secret writes.
  "Bash(wrangler login*)",
  "Bash(wrangler logout*)",
  "Bash(wrangler secret*)",
  "Bash(wrangler deploy*)",
  "Bash(turbo run deploy*)",

  // Publishes.
  "Bash(npm publish*)",
  "Bash(bun publish*)",

  // Remote shell / exfil primitives.
  "Bash(scp *)",
  "Bash(rsync *@*)",
  "Bash(ssh *)",
];
