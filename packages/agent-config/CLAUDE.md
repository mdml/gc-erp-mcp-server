# CLAUDE.md — packages/agent-config

Source of truth for the team-wide Claude Code policy. Owns `.claude/settings.json` as a build output: nothing else in the repo writes to `.claude/`, and `.claude/` is gitignored.

## What's here

| File / dir | Role |
|---|---|
| `src/policy/allow.ts` | Allowed Bash patterns + allowed MCP tool names (pure data) |
| `src/policy/deny.ts` | Denied Bash patterns (pure data) |
| `src/policy/mcp.ts` | `enabledMcpjsonServers` list (pure data) |
| `src/settings.ts` | Pure composer — produces the final `SettingsJson` shape from policy data |
| `src/install.ts` | CLI entry: writes `.claude/settings.json` atomically, deletes any stray `settings.local.json` |
| `src/bootstrap.ts` | CLI entry: worktree first-run setup. Runs from the `post-checkout` lefthook. |
| `src/io.ts` | Small I/O primitives (atomic write, workspace-root lookup, subprocess runner) |
| `src/*.test.ts` | Vitest suites — policy shape invariants + settings composition |

## When to touch this package

- **Adding an allow pattern** → edit `src/policy/allow.ts`. Run `bun run install-agent-config` and commit nothing from `.claude/` (it's gitignored; regenerated on `bun install`).
- **Adding a deny pattern** → edit `src/policy/deny.ts`.
- **Enabling an MCP server** → edit `src/policy/mcp.ts`.
- **Editing worktree bootstrap steps** → edit `src/bootstrap.ts`. Keep it thin — hard-fail on any unexpected error so a broken worktree doesn't sit in a half-set-up state.

## Invariants

- **`.claude/` is a build output.** Never hand-edit `.claude/settings.json`; regenerate from this package. There is no `settings.local.json` escape hatch — if you need a new permission, send a PR.
- **`install.ts` never preserves prior `.claude/` contents.** It overwrites `settings.json` and deletes `settings.local.json` if present. Drift prevention is achieved by the fact that the regeneration step is part of `prepare` (runs on every `bun install`) and `post-checkout`.
- **Atomic writes.** `settings.json` is temp-file + rename, mirroring `sync-secrets`' approach for `.envrc.enc`. A crash mid-write never leaves Claude Code reading half a file.
- **No cross-package imports into `agent-config`.** The runtime (`mcp-server`) must not import from here; this is a tooling package and installs its config once, then gets out of the way.
- **Policy changes are team decisions, not per-dev.** The whole point of deleting `settings.local.json` is to force permission drift into a PR. Resist the temptation to reintroduce per-developer overrides without a broader design conversation.

## Testing approach

Coverage is enforced on the pure pieces; shell-outs are excluded per the [repo coverage policy](../CLAUDE.md). What to test:

- `src/settings.ts` — that composition produces the expected `{ permissions: { allow, deny }, enabledMcpjsonServers }` shape, with stable sort order for diffability.
- `src/policy/*.ts` — shape invariants (no duplicate patterns, no overlaps between allow and deny for the same exact string).

Exclude from coverage:

- `src/install.ts` — thin disk write + unlink.
- `src/bootstrap.ts` — shells out to `bun install` / `turbo run …`.
- `src/io.ts` — primitives (subprocess, atomic write).

## Don't add

- **Per-agent permission overrides (yet).** The first slice is shared policy only. Per-agent-type differences (e.g. a tighter policy for subagents with web access) are a separate slice; propose via ADR before coding.
- **Hand-authored `.claude/settings.json` fixtures in tests.** Compose from `src/settings.ts` so fixtures can't drift from policy.
