---
type: ADR
id: "0004"
title: "Two-layer acceptance testing: pure-handler tool tests + scenario runner"
status: active
date: 2026-04-17
---

## Context

The product is an MCP server whose consumers are LLM clients (Claude Desktop/web/mobile). That gives "acceptance testing" two distinct surfaces, often conflated:

1. **Protocol + tool contract.** Given a tool call with valid inputs, does the server produce the right DB side effects and return the right typed output? Deterministic, fast, CI-friendly.
2. **End-to-end scenario.** Given a sequence of tool calls that models a real job (TOOLS.md §6 — the kitchen remodel), does the composite state roll up correctly across days? Also deterministic when scripted, but touches the MCP transport + deployed runtime.

A third surface — **LLM-driven E2E** (natural-language prompt → Claude picks a tool → server responds → assert on outcome) — is genuinely different (non-deterministic, API-cost-bearing) and is a separate trade-off.

Two facts shaped the decision now rather than later:

1. **Layer-1 pattern implicitly landed in PR #7** (`feat(mcp-server): create_job, list_jobs, ensure_activity`). The `McpToolDef<I, O>` shape in [`packages/mcp-server/src/tools/_mcp-tool.ts`](../../packages/mcp-server/src/tools/_mcp-tool.ts) separates a pure `handler({ db, input })` from the MCP registration wrapper; [`_test-db.ts`](../../packages/mcp-server/src/tools/_test-db.ts) spins up in-memory SQLite via `better-sqlite3` and runs the real `packages/database/src/migrations`. Tests exercise the handler directly against a real SQL round-trip without workerd/Miniflare. This ADR codifies the pattern as the layer-1 standard rather than leaving it as an accidental convention that subsequent PRs might diverge from.
2. **M2 needs to be demo-able.** Max is planning to demo commitments + NTP against the kitchen walkthrough. TOOLS.md §6 already reads like a script; it needs a runner.

## Decision

**Adopt a two-layer acceptance-testing strategy.**

**Layer 1 — tool-contract tests.** Every `packages/mcp-server/src/tools/<name>.ts` exports a `McpToolDef` whose `handler({ db, input })` is a pure async function. A colocated `<name>.test.ts` spins up `createTestDb()` (in-memory SQLite, production migrations applied) and calls `handler` directly. A single `handler.test.ts` covers the MCP protocol boundary (bearer auth, routing, error wrapping) for all tools. Layer-1 coverage counts toward the per-package 90%/70% thresholds.

**Layer 2 — scenario runner.** A new `packages/dev-tools/src/scenarios/` module exposes `bun run scenario <name>`, which connects an `@modelcontextprotocol/sdk` client to `bun run dev` (wrangler dev) over HTTP + bearer, drives TOOLS.md §6 as per-Day async functions, and asserts on derived state at each checkpoint. The runner is a thin I/O wrapper and is excluded from coverage per the `packages/CLAUDE.md` exclusion policy; correctness is guarded by layer-1 tests on the tool handlers it calls.

**Layer 3 — LLM-driven E2E — is explicitly deferred.** M6 ("run a real job") is the organic acceptance test for Claude's tool-selection behavior. Until a wedge demands it, LLM-in-CI is out of scope.

## Options considered

- **A. Two-layer as above (chosen).** Pure-handler tool tests + over-the-wire scenario runner. Layer-3 deferred.
  - *Pros:* layer 1 is already shipped, so the cost is codification + one new runner package; schema drift between `packages/database` migrations and tool handlers is caught automatically because the test DB runs the real migrations; scenario runner doubles as demo script and as a seed-state generator; two-layer separation matches the actual consumer split (protocol + composite state).
  - *Cons:* `better-sqlite3` is synchronous-under-the-hood wrapped async; D1 is async network. Diverges slightly on edge cases (pragmas, extension support, concurrency semantics). Mitigated by only using SQL features Drizzle abstracts. Scenario runner requires a two-terminal workflow (`bun run dev` + `bun run scenario`) — acceptable for a dogfood product.
- **B. Miniflare-backed integration as the primary layer.** Use `@cloudflare/vitest-pool-workers` to spin up the full Worker + DO + D1 per test.
  - *Rejected.* Heavier per-test cost; `packages/mcp-server/CLAUDE.md` already rejects in-process DO spin-up ("DO runtime is workerd-only"); the pure-handler split means DO spin-up isn't needed to cover tool behavior. Miniflare is the right answer for *wrangler-config* regressions (bindings, migrations, compat date), but those are deploy-time concerns better caught by `turbo run deploy` against a dev account than by vitest.
- **C. LLM-driven E2E from the start.** Use the Agent SDK in CI to drive NL scenarios against the server.
  - *Rejected for now.* Non-determinism erodes trust in the gate faster than it catches bugs. API cost is real. M6 is already the real-world acceptance test for tool-selection; layer-2 scripted scenarios catch the rest. Revisit post-M3 if cost-entry-form UX exposes Claude-picks-wrong-tool failures not caught by layer 1-2.
- **D. Single-layer — just in-memory tool tests.** Skip the scenario runner.
  - *Rejected.* No way to demo composite state across days. Kitchen walkthrough lives in TOOLS.md §6 as narrative only — no executable artifact. Max has explicitly asked for demo-ability.
- **E. `InMemoryTransport` scenario runner (MCP SDK in-process, no HTTP).** Scenario script speaks MCP but connects via an in-memory transport pair rather than HTTP.
  - *Rejected for layer 2.* The demo value comes from real HTTP + Worker logs visible in a neighboring terminal. An in-memory variant might still land later as a CI-runnable fast-path; not in scope for this ADR.

## Consequences

**Easier:**

- Every new tool gets a test template by copying an existing `<name>.test.ts`; the `createTestDb()` + pure-handler pattern means no mocks, no DO boot, no transport scaffolding.
- `packages/database` migration drift is caught automatically — the test DB runs the real SQL migrations, so a schema change that breaks a tool's SQL fails the tool's tests, not just the database package's tests.
- Layer-2 scenario runner produces a repeatable demo: `bun run dev` on one pane, `bun run scenario kitchen` on the other, each step printing tool call → response → ✓/✗. Doubles as onboarding material for a new operator.
- The scenario runner outputs against a fresh dev D1 can be dumped to a `seeds/kitchen.sql` file, collapsing the "seed fixture" task into "run the scenario and capture state."

**Harder:**

- Edge cases where D1 and `better-sqlite3` diverge (FTS5, certain pragmas, write-concurrency under multi-connection) aren't caught at layer 1. Accepted trade-off; such features trigger either an explicit Miniflare test or deliberate manual verification against `wrangler dev`.
- Layer 2 needs a reset-dev-D1 helper (scenarios assume empty state) — small piece of ergonomics to design.
- Two packages own the testing surface (`mcp-server` for layer 1, `dev-tools` for layer 2). Acceptable; matches the existing runtime-vs-tooling split documented in `packages/CLAUDE.md`.

**Would trigger re-evaluation:**

- First wedge where Claude-picks-wrong-tool or argument-inference errors become the regression source — that's the prompt to invest in layer 3.
- First time a D1-specific semantic bites in production that layer-1 tests didn't catch — that's the prompt to add a Miniflare integration suite (still scoped, not a wholesale replacement).
- A second MCP app (M4+) whose acceptance depends on app↔server sampling round-trips — the scenario runner may need an app-simulation mode, or we may split layer 2 into "data scenario" and "app scenario."

## Advice

Decided in session with Max on 2026-04-17. Key reasoning points raised:

- Max's framing: "(1) first, but also (2), since it's really helpful for demo'ing." The demo requirement is load-bearing for layer 2 — without it, a CI-oriented runner would suffice.
- Layer 1 had already shipped in PR #7 (adopted as a convention without an ADR); retroactive codification is cheaper than letting subsequent tool PRs drift to different patterns.
- Deferring layer 3 is a conscious trade of breadth for trust-in-gate. Not a forever decision.
