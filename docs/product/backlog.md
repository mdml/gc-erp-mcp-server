# Backlog

Unresolved questions and tasks that should land before or during their corresponding milestone.

## Data-model questions (block M1–M2)

- [ ] Decide: CSI codes as the scope taxonomy, or custom lightweight list? Commercial CSI may be overkill for residential custom. *(Currently: free-form `name` + optional `code`; see [SPEC.md Open Questions](../../SPEC.md).)*
- [x] ~~Decide: storage — Postgres, SQLite + Litestream, or something even simpler for v1?~~ *Resolved: D1 for domain state, R2 for blobs, DO for MCP session runtime only. See [ADR 0003](../decisions/0003-storage-split.md).*
- [x] ~~Decide: where do commitments live in git-shaped storage vs. mutable DB?~~ *Resolved: append-only `patches` table in D1 + materialized commitment projection. Commitment state = fold(patches). [ADR 0003](../decisions/0003-storage-split.md).*
- [x] ~~Design the "activity" concept for scopes done in multiple pieces.~~ *Resolved in SPEC.md: scope as nested tree + activity as server-level shared taxonomy + commitment with N activations. Starter library of 22 activities in [TOOLS.md §7](../../TOOLS.md).*
- [x] ~~Sketch commitment schema.~~ *Drafted in SPEC.md §1.*
- [x] ~~Sketch NTP event.~~ *Drafted in SPEC.md §1.*
- [x] ~~Land `Document` schema in SPEC.md §1.~~ *Resolved in SPEC.md §1: content-addressed by sha256, `jobId` optional, tags free-form v1, versioning deferred. [TOOLS.md §2](../../TOOLS.md) has the narrative.*

## File ingestion

- [ ] Decide retention policy for R2 blobs (Document rows are permanent; the objects may not need to be). Post-POC.

## Product wedge

- [ ] Pick the POC wedge — leaning pay app automation (painful, recurring, money-on-the-line).
- [ ] Study Adaptive (AI-native construction accounting) — closest to this thesis, either a template or a competitor.

## Meta

- [x] ~~Decide how Claude Code will be fed the spec: one living `SPEC.md` in the repo, or one `SKILL.md` per module?~~ *Resolved: SPEC.md (types) + [TOOLS.md](../../TOOLS.md) (verbs) at repo root, growing `docs/` tree for guides/decisions/product. Per-tool docs live as JSDoc on the handler modules.*
