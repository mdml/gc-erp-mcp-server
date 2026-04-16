# Backlog

Unresolved questions and tasks that should land before or during their corresponding milestone.

## Data-model questions (block M1–M2)

- [ ] Decide: CSI codes as the scope taxonomy, or custom lightweight list? Commercial CSI may be overkill for residential custom. *(Currently: free-form `name` + optional `code`; see [SPEC.md Open Questions](../../SPEC.md).)*
- [ ] Decide: storage — Postgres, SQLite + Litestream, or something even simpler for v1? *(Leaning: Durable Object SQLite — see [ARCHITECTURE.md](../guides/ARCHITECTURE.md).)*
- [ ] Decide: where do commitments live in git-shaped storage vs. mutable DB? *(Leaning: append-only events + materialized state.)*
- [ ] Design the "activity" concept for scopes done in multiple pieces (Framing → Lumber Drop / Frame / Punch). *(Resolved in SPEC.md: scope as nested tree + activity as server-level shared taxonomy + commitment with N activations.)*
- [ ] Sketch commitment schema: price (lump / $ per unit), scope ref, throughput, lead time, build time, activation(s). *(Drafted in SPEC.md.)*
- [ ] Sketch NTP event: commitment ref, date, site-ready check, expected start-by, expected finish-by. *(Drafted in SPEC.md.)*

## Product wedge

- [ ] Pick the POC wedge — leaning pay app automation (painful, recurring, money-on-the-line).
- [ ] Study Adaptive (AI-native construction accounting) — closest to this thesis, either a template or a competitor.

## Meta

- [ ] Decide how Claude Code will be fed the spec: one living `SPEC.md` in the repo, or one `SKILL.md` per module? *(Currently: one SPEC.md plus a growing `docs/` tree.)*
