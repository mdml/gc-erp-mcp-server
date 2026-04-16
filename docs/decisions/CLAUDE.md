# ADRs — Agent instructions

Architecture Decision Records live here. Each ADR captures **one decision**, the alternatives considered, and the reasoning — so future-us (or a new developer) doesn't re-litigate a question that's already been answered.

## When to write an ADR

Write one when you're making a decision that:

- Introduces a new dependency, framework, or platform
- Chooses between architectures that both work (e.g. "DO-backed state vs. external DB")
- Establishes a cross-cutting pattern (auth model, testing strategy, error handling)
- Resolves an open question in [SPEC.md](../../SPEC.md) or [docs/product/backlog.md](../product/backlog.md)
- Is the output of a spike in `docs/spikes/` — the spike file is then deleted; the ADR is the permanent record

Do **not** write one for bug fixes, routine refactors, renaming, or formatting.

## When NOT to edit an existing ADR

Once an ADR is `active`, its substance is immutable. If the decision changes:

1. Create a new ADR with the new decision.
2. Set the new ADR's `status: active` and (if applicable) add `spike: NNN`.
3. Edit the old ADR's front matter only: change `status: active` → `status: superseded` and add `superseded_by: "NNNN"`.

This keeps the chain of reasoning intact. Rewriting the original ADR destroys the audit trail.

The exception: cosmetic fixes (typos, broken links, formatting) are fine to edit in place.

## Numbering + filename

- Monotonically increasing, zero-padded to four digits: `0001-`, `0002-`, …
- Filename: `{NNNN}-{kebab-case-title}.md`
- Use [0000-template.md](0000-template.md) as the starting point.

## What belongs in each section

- **Context** — state of the world before the decision. Forces, constraints, who is affected. If a reader skipped everything else they should still understand *why* this was on the table.
- **Decision** — one or two bolded sentences. If you need a paragraph, split the decision.
- **Options considered** — at least two options. The rejected options are often more valuable than the chosen one for later re-evaluation.
- **Consequences** — what becomes easier, what becomes harder, what triggers re-evaluation. Concrete, not hand-wavy.
- **Advice** (optional) — who was consulted before deciding. Useful when the reasoning depended on domain expertise that won't be obvious later.

## Relation to other doc types

- **SPEC.md**: the *shape* of the data model. ADRs may resolve open questions in SPEC; SPEC is not where the reasoning lives.
- **docs/guides/**: current state (how things work right now). ADRs explain *why* the current state is the way it is.
- **docs/product/**: what we're building and why. ADRs explain the *technical* decisions in service of the product; product docs explain the *product* decisions.
- **docs/spikes/** (when populated): ephemeral investigations that resolve into ADRs.
