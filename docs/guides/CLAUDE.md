# Guides — Agent instructions

Guides describe **how the system currently works**. If the code changes in a way that contradicts a guide, update the guide in the same PR.

## Current guides

| Guide | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Repo layout, runtime lifecycle, secrets flow, deploy, quality gates, toolchain choices. |

## When to update

- **A structural change landed** — new package, new top-level config, new deployment path. Update the repo layout section of ARCHITECTURE.md.
- **A runtime behavior changed** — e.g. the bearer-auth gate moved, a new Durable Object was added, the MCP transport changed. Update the "Runtime" section.
- **A gate changed** — e.g. threshold raised, new check added, tool replaced. Update the "Quality gates" and "Toolchain" tables.
- **A decision documented in an ADR** — add a one-line pointer in ARCHITECTURE.md's "Deferred" or "Toolchain" section as relevant. The ADR carries the *why*; the guide carries the *what-is*.

## When NOT to update

- Ongoing work that hasn't landed. Guides describe current state, not aspirational state.
- Bug-fix churn. The guide is not a changelog.

## Style

- Prefer **tables and diagrams** over prose — they survive refactors better.
- Always link to the authoritative source (file path, ADR, SPEC section). Guides summarize; they are not source of truth.
- Keep each section under ~30 lines. If a topic needs more, split it into a design doc and link.
