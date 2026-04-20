# CLAUDE.md — apps/cost-entry-form

The first MCP app — a pre-filled cost-entry form that Claude renders inline via [`@modelcontextprotocol/ext-apps`](../../docs/decisions/0014-mcp-apps-sdk.md). Builds to a single-file HTML artifact (`dist/cost-entry-form.html`) that `apps/mcp-server` inlines at build time and serves over `resources/read` at `ui://cost-entry/form.html`.

## What's here

| File | Role |
|---|---|
| `src/cost-entry-form.html` | Vite entry; loads `main.ts` and declares the form skeleton |
| `src/main.ts` | Runtime bootstrap — constructs `App` + `PostMessageTransport`, registers handlers, wires DOM events |
| `src/form.ts` | Pure logic — pre-fill + state + validation + `canSave()` predicate + `buildRecordCostArguments()` |
| `src/form.test.ts` | Vitest suite over `form.ts` only (runtime handshake is dogfood-only) |
| `vite.config.ts` | Vite + `vite-plugin-singlefile` — inlines JS + CSS into one HTML |
| `vitest.config.ts` | Coverage on `form.ts`; excludes `main.ts` (host-envelope territory) |
| `tsconfig.json` | ES2022 + `bundler` resolution + DOM libs |

## Runtime model

1. Host mounts the view iframe and pushes `ui/notifications/tool-input` (Claude's args to `cost_entry_form`) then `ui/notifications/tool-result` (the server's resolved pre-fill in `structuredContent`).
2. `main.ts` merges both into `FormState` and renders the form.
3. The operator edits fields; changes update `FormState` and re-evaluate `canSave()`.
4. Operator clicks **Save**; `onSaveClick` calls `app.callServerTool({ name: "record_cost", arguments })`.

See [ADR 0014](../../docs/decisions/0014-mcp-apps-sdk.md) for the SDK choice and [the vendor guide](../../docs/guides/mcp-apps.md) for the wire format.

## Invariants

- **Save is the attestation. The click is the product.** `app.callServerTool` is only called from `onSaveClick`, which additionally guards on `event.isTrusted` and `canSave(state)`. Never call `callServerTool` on load, on field change, on `onhostcontextchanged`, or from any setTimeout/microtask. An auto-submit at any level invalidates M3's PoC — Claude can't synthesize a click inside the sandboxed iframe, so the button is what makes "costs only land when a human says so" true. If a future slice adds a "save draft" path, add it as a separate button (or a hidden `visibility: ["app"]` tool) rather than weakening the Save path.
- **Register handlers before `connect()`.** Events can fire immediately after the handshake (vendor guide §3). `ontoolinput` / `ontoolresult` / `onhostcontextchanged` / `onteardown` all live *above* the `await app.connect(…)` line.
- **`callServerTool` takes an object.** `{ name, arguments }`, per SDK 1.6.0 `dist/src/app.d.ts:784`. The positional form in spike 0001 §6c is stale — don't copy it.
- **`PostMessageTransport` needs both args.** `new PostMessageTransport(window.parent, window.parent)` for a view. The vendor guide's bare-`new` form was POC shorthand; 1.6.0's signature requires the `eventSource` argument.
- **Missing required IDs disable Save. Don't synthesize defaults.** M3 is pre-fill-only — if `structuredContent` didn't supply `scopeId`, `commitmentId`, `activityId`, or `counterpartyId`, the Save button stays disabled and the missing-hint renders. No picker, no "scope not chosen yet" flow — that's M4+ scope.
- **`CostSource` is mirrored structurally, not imported.** Importing from `@gc-erp/database` would pull zod + drizzle into the view bundle. If `CostSource` grows a variant in the database package, update `form.ts` in the same PR (both sides change together, same commit).
- **No `node:*` imports.** The view runs in a browser iframe. `vite.config.ts` may use `node:*` at build time; `src/` may not.
- **No runtime fetch of the SDK.** The vendor guide's §3 `esm.sh` shape is for illustration only — we bundle with Vite singlefile so there's no second origin in our CSP.

## Testing

- **`form.ts` is the coverage target.** Pure, deterministic, no DOM. Tests cover `canSave()`, the IsoDay / amountCents / source validators, and `buildRecordCostArguments()` shape.
- **`main.ts` is excluded from coverage.** Constructing `App` + `PostMessageTransport` under vitest is host-envelope territory — `postMessage` against a fake parent window doesn't exercise the real MCP handshake, and mocking the SDK defeats the point. Runtime handshake is verified via Claude Desktop dogfood, not vitest.
- **If you want to test `main.ts`, extract pure helpers into `form.ts`.** Same rule as `apps/mcp-server/`: move the logic into a function the runtime calls, test the function directly.

## Don't add

- **React (yet).** Plain DOM wiring is fine for one form. When M4 (`job_dashboard`) lands a more complex tree, evaluate `@modelcontextprotocol/ext-apps/react` + `useApp` at that point — not now.
- **State-management libraries.** `FormState` is a plain object; `render()` is a function. Adding Redux/Zustand/etc. for a single form is over-engineered.
- **External asset references.** No `<link rel="stylesheet">`, no `<img src="https://…">`, no `<script src="https://…">`. Vite singlefile inlines everything; anything it can't inline trips the host CSP.
- **Auto-submit.** See the attestation invariant above. If you find yourself writing `app.callServerTool` outside `onSaveClick`, stop and re-read this file.

## Build + dev

- `turbo run build --filter=@gc-erp/cost-entry-form` — one-shot build; output at `apps/cost-entry-form/dist/cost-entry-form.html`.
- `bun run --cwd apps/cost-entry-form dev` — Vite dev server; no host handshake, form renders with empty pre-fill.
- `open apps/cost-entry-form/dist/cost-entry-form.html` — standalone preview; `PostMessageTransport` fails to handshake (no host parent), but the skeleton should paint without throwing.

`apps/mcp-server` consumes the output via a Text-loader import (see [vendor guide §6.4](../../docs/guides/mcp-apps.md)) — integration lands in a follow-up commit on the slice, not in the workspace-scaffolding PR.
