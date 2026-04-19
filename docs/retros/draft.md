# Retro draft — queue of topics for future retros

One-liners only. Date prefix, terse, enough context to be readable later without this session. See [CLAUDE.md](CLAUDE.md) for the two-fold pattern (queue here; Max initiates the actual retro).

Pruned when the entry has been addressed in a dated retro (or explicitly dropped). Otherwise append-only.

## Open

- 2026-04-19 — oauth-clerk slice: leaked live `CLERK_SECRET_KEY` to stdout via wrong `wrangler dev --var KEY=VAL` syntax (wrangler 4.x wants `KEY:VAL`). Key rotated. Memory saved (`feedback_cli_flag_syntax_before_secrets`). Worth discussing if the repo should codify a "never pass secrets via `--var`; always `.dev.vars` or `wrangler secret put`" rule. See [PR #29](https://github.com/mdml/gc-erp-mcp-server/pull/29) §Security note.
- 2026-04-19 — oauth-clerk slice: pre-flight 3's ambiguity ("connector shows Connected" requires MCP JSON-RPC handshake, not just auth) cost ~15 min of "why isn't claude.ai happy?" debugging. Logs proved Clerk auth green; the handshake gap is solved for free by `McpAgent` in the real slice. Worth sharpening future pre-flight prompts: separate "auth works" gates from "full MCP protocol works" gates explicitly.
- 2026-04-19 — oauth-clerk slice: coordinator-agent loop ran smoothly with inline `AskUserQuestion` checkpoints (pre-flight 1 confirmation, tunnel-vs-deploy choice for pre-flight 3, preflight cleanup choice). Worth confirming this feels right as the slice retros accumulate.
