# Spike — MCP Apps SDK for M3 `cost_entry_form`

> **Purpose.** Decide whether (and how) to build [M3's `cost_entry_form` app](../../TOOLS.md) on the official MCP Apps SDK (`@modelcontextprotocol/ext-apps`). M3 is the first time this repo ships UI to Claude; getting the render + submission shape wrong means rewriting the app surface for M4 (`job_dashboard`) and M5 (`pay_app_preview`). Surface the forks Max needs to resolve before scaffolding the app package.
>
> **Scope.** Design + dependency-fit only. No code under `packages/`. Resolves into (a) an ADR that adopts (or rejects) the SDK, (b) a new `apps/cost-entry-form/` package checklist, (c) updates to [TOOLS.md §5.1](../../TOOLS.md) and [ARCHITECTURE.md](../guides/ARCHITECTURE.md) describing the app-rendering pipeline. This file deletes once resolved.
>
> **Starting point.** [`@modelcontextprotocol/ext-apps@1.6.0`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) (published 2026-04-14). Spec: [SEP-1865 / 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx). Local SDK tree cloned into `/tmp/mcp-apps-research/mcp-ext-apps/` for inspection. Host target for M3: **Claude Desktop first** ([project memory — M3 dogfood sequencing](../../CLAUDE.md)); claude.ai web + mobile treated as follow-ups. Existing server: [`packages/mcp-server/src/index.ts`](../../packages/mcp-server/src/index.ts) runs on Cloudflare Workers with `@modelcontextprotocol/sdk@1.29.0` + `agents@0.11.0` (`McpAgent`).

---

## 1. What the MCP Apps extension actually is

**Answer.** MCP Apps is a formally ratified MCP extension (SEP-1865, status **Stable** as of 2026-01-26) that standardizes how a server ships an interactive UI alongside a tool result. Extension identifier: `io.modelcontextprotocol/ui` ([spec §Extension Identifier](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx); also `EXTENSION_ID` in [`src/server/index.ts:396`](../../../../../tmp/mcp-apps-research/mcp-ext-apps/src/server/index.ts)). It unifies the prior-art patterns from MCP-UI and OpenAI's Apps SDK behind one spec (spec §Motivation).

The three-role split:

| Role | Lives at | What it does |
|---|---|---|
| **Server** | Our Worker | Declares tools whose result should render an app; serves HTML via `resources/read` on `ui://` URIs |
| **Host** | Claude Desktop / claude.ai | Runs the MCP client, embeds the View in a sandboxed iframe, proxies server ↔ view messaging |
| **View** | The iframe | Standard HTML+JS app; talks to host via `postMessage` using an `App` class from `@modelcontextprotocol/ext-apps` |

The extension is **opt-in per client**. A host advertises support at initialize time by setting `capabilities.extensions["io.modelcontextprotocol/ui"] = { mimeTypes: ["text/html;profile=mcp-app"] }`; the server calls `getUiCapability(clientCaps)` to decide whether to register the UI variant of a tool (non-UI hosts still get a text-only version of `record_cost`). This is the **"progressive enhancement"** contract the spec repeatedly enforces ([spec §Progressive Enhancement](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)).

Implications for us:

- The spec is stable, not draft. Shipping against `2026-01-26` is not chasing a moving target.
- We keep a `record_cost` code path that works without UI (already what we have today). The app is additive.
- Capability negotiation gives us free A/B surface for hosts that don't render apps yet (`claude` CLI, third-party clients, future hosts).

---

## 2. SDK candidates + dependency fit

**Answer.** One realistic candidate: **`@modelcontextprotocol/ext-apps@1.6.0`**, published 2026-04-14. It is the reference implementation from the spec authors (Anthropic / spec working group) and the only SDK that exports first-class helpers for both the server side (`registerAppTool`, `registerAppResource`, `getUiCapability`) and the view side (`App`, `PostMessageTransport`, `useApp` for React).

Subpaths we'd actually import:

| Subpath | Where | Purpose |
|---|---|---|
| `@modelcontextprotocol/ext-apps/server` | Worker (`packages/mcp-server`) | `registerAppTool`, `registerAppResource`, `getUiCapability`, `RESOURCE_MIME_TYPE` |
| `@modelcontextprotocol/ext-apps` | View bundle (`apps/cost-entry-form`) | `App` class, `PostMessageTransport` |
| `@modelcontextprotocol/ext-apps/react` | View bundle | `useApp` hook for React |

Peer deps: `@modelcontextprotocol/sdk@^1.29.0` (we run exactly 1.29.0 — [`packages/mcp-server/package.json`](../../packages/mcp-server/package.json)), `zod@^3.25.0 || ^4.0.0` (we run 4.3.6), `react@^17||^18||^19` optional.

**Quarantine flag (F2.1 — ratified with Max 2026-04-19).** Our `bunfig.toml` enforces `minimumReleaseAge = 604800` (7 days). `@modelcontextprotocol/ext-apps@1.6.0` landed 2026-04-14 → 5 days old on 2026-04-19 → **inside the window**. Max ratified targeting v1.6.0 directly, adding it to `minimumReleaseAgeExcludes` as a *timeboxed exception* (drop the exclude entry once v1.6.0 crosses the 7-day mark on 2026-04-21). Fallback-of-record if the timeboxed approach turns out to be uncomfortable: v1.5.0 (published 2026-04-02, 17 days old) exports the same `registerAppTool` / `registerAppResource` API — the delta in 1.6.0 is refinements to spec-types and client helpers, not server-surface changes we depend on.

Rejected candidates:

- **[mcp-ui](https://mcpui.dev/) community SDK.** Pre-dates the official extension; spec authors explicitly position `ext-apps` as the successor (spec §Motivation). Adopting mcp-ui now would need a re-port when Claude Desktop standardizes on the SEP-1865 protocol.
- **Hand-roll the protocol.** The wire format is 21 JSON-RPC-over-postMessage message types (see Q6 below); re-implementing the sandbox-proxy handshake, CSP plumbing, host-context notifications, and teardown dance is weeks of work for a pattern that was already written.

---

## 3. Claude Desktop rendering model (primary dogfood target)

**Answer.** Claude Desktop is a **native/Desktop host** in the spec's taxonomy (spec §Lifecycle §2 "UI Initialization (Desktop/Native Hosts)"). The rendering flow for our `cost_entry_form` app will be:

1. On connect, server returns `tools/list` including `cost_entry_form` with `_meta.ui.resourceUri = "ui://cost-entry/form.html"`. Host also sees the tool's `inputSchema`.
2. Claude decides to call `cost_entry_form` (either autonomously or nudged by the operator). Host sends `tools/call`.
3. Host calls `resources/read` on `ui://cost-entry/form.html` to fetch the bundled HTML (`mimeType: "text/html;profile=mcp-app"`), along with the resource's `_meta.ui` (csp, permissions, domain, prefersBorder).
4. Host renders an iframe directly with the HTML (no sandbox-proxy indirection — that's only for Web hosts; spec §Lifecycle §2 "Web hosts" branch).
5. View sends `ui/initialize` → Host replies with `McpUiInitializeResult` (host context: theme, locale, containerDimensions, platform="desktop"). View sends `ui/notifications/initialized`.
6. Host pushes `ui/notifications/tool-input` (the args Claude generated) then, when the server returns, `ui/notifications/tool-result`.
7. Interactive phase: user edits fields; view calls `tools/call` for `record_cost` (or a hidden `confirm_cost_entry` — see Q8) proxied through host → server.

The rendering model is **one iframe per tool call**, torn down on host-triggered `ui/resource-teardown`. No long-lived component instance across calls; state preservation is the view's responsibility via `viewUUID` + localStorage if needed ([`docs/patterns.md`](../../../../../tmp/mcp-apps-research/mcp-ext-apps/docs/patterns.md) "View state" section).

**Caveat.** Public Claude Desktop version-pinning: the spec's capability-negotiation section means we discover at connect time whether a given Desktop build advertises `io.modelcontextprotocol/ui`. If an operator is on an old Desktop build, they see `record_cost` as a plain text tool. This is the intended graceful-degradation path and requires no code change on our side other than branching tool registration on `getUiCapability()` (spec §Progressive Enhancement).

---

## 4. claude.ai web + mobile parity

**Answer.** claude.ai is a **Web host** in the spec's taxonomy. Web hosts use a two-iframe "sandbox proxy" pattern (spec §Lifecycle §2 "Web hosts"): the host renders a *proxy* iframe on a dedicated origin, which in turn renders the *real* view iframe on a different dedicated origin, with HTML injected via `ui/notifications/sandbox-resource-ready`. The complexity is hidden from the view (the `App` class + `PostMessageTransport` abstract both paths).

Concrete evidence claude.ai supports this:

- The SDK ships a helper pattern `computeAppDomainForClaude(mcpServerUrl)` that derives a stable `{sha256}.claudemcpcontent.com` subdomain for the view sandbox ([`src/server/index.examples.ts` via `docs/csp-cors.md`](../../../../../tmp/mcp-apps-research/mcp-ext-apps/docs/csp-cors.md)). The existence of the `claudemcpcontent.com` content-host is a strong signal that claude.ai has shipped (or is shipping) the sandbox-proxy host side.
- The spec's `McpUiHostContext.platform` enum is `"web" | "desktop" | "mobile"` — mobile is a first-class host context.
- `safeAreaInsets` + `deviceCapabilities.touch` fields ([`src/spec.types.ts:397-407,390-396`](../../../../../tmp/mcp-apps-research/mcp-ext-apps/src/spec.types.ts)) exist specifically for mobile rendering.

**Status for M3.** Per project memory ([M3 dogfood sequencing](../../CLAUDE.md)), Desktop is primary and claude.ai is a follow-up that primarily buys mobile reach (tool-only mobile is already valuable today). Our recommendation optimizes for Desktop rendering but uses only capabilities the spec marks as MUST-support for any conformant host — nothing Desktop-specific — so claude.ai parity should come for free when Anthropic ships it.

**Risks to flag, not block on:**

- CSP headers: our `_meta.ui.csp` declaration is honored identically across Desktop and Web per spec §Content Requirements §Host Behavior. If the view doesn't need outbound HTTP (M3's `cost_entry_form` only talks to the server via `tools/call`, not raw `fetch`), we can leave `csp` empty and inherit the restrictive default `connect-src 'none'`.
- **Document preview fork (§8 below):** the left pane of the form renders a signed R2 URL via an `<iframe>`. That requires us to either (a) add the Cloudflare R2 presigned domain to `connectDomains` *and* `frameDomains`, or (b) inline the PDF as base64 in the tool result and render it via `data:`. Option (a) is Web-host-safe; (b) blows the tool-result size budget for multi-MB invoices. Flag for ADR.

---

## 5. Worker-bundle cost

**Answer.** **+4.3 KB gzipped** (+4,376 bytes) over our current Worker bundle, measured in a scratch Cloudflare Worker project with identical bundler flags (`esbuild --bundle --platform=neutral --format=esm --target=es2022 --minify`). Raw minified delta: +17,129 B.

| Variant | Raw (min) | Gzipped | Delta (gz) |
|---|---|---|---|
| Baseline (`McpServer` + `McpAgent` + one `ping` tool — mirrors current `packages/mcp-server/src/index.ts`) | 932,588 B | 215,029 B | — |
| + `registerAppTool` + `registerAppResource` + one app tool + one HTML resource | 949,717 B | 219,405 B | **+4,376 B** (~2%) |

Node-API audit: `@modelcontextprotocol/ext-apps/server` adds **zero** `node:*` imports to the bundle. The three pre-existing `node:async_hooks` / `node:diagnostics_channel` / `node:os` references come from `agents@0.11.0` (unchanged) and are already handled by our Worker's existing build path. No `nodejs_compat` flag change is required to adopt the SDK.

**One landmine, not counted in the above but real:** the SDK's [React example server](../../../../../tmp/mcp-apps-research/mcp-ext-apps/examples/basic-server-react/server.ts) uses `fs.readFile` to load bundled HTML at request time. That's Node-only and will break under `workerd`. Our Worker path has to inline the bundled HTML at build time — either via esbuild's `loader: 'text'` on `*.html`, or Vite's `?raw` suffix in the app's build, or a wrangler [assets binding](https://developers.cloudflare.com/workers/static-assets/). Using an inline string import adds the HTML *payload* size (target: keep bundled form under ~50 KB gz, achievable with Vite's `vite-plugin-singlefile` producing a dependency-free bundle — see spec §UI Resource Format for the single-file convention). Call this roughly **another +20-40 KB gz per shipped app** — not SDK cost, but app-payload cost we'd pay with any SDK.

Full scratch methodology + raw numbers are captured in `/tmp/mcp-apps-bundle-scratch/` (to be manually deleted post-PR; not inside the worktree).

---

## 6. Wire format — tool result → UI → submission round-trip

**Answer.** The wire format is vanilla MCP JSON-RPC, extended with a `ui/*` method namespace carried over `postMessage` between host and view. There is no new transport; the view-side `App` is itself a standard MCP `Protocol` subclass (see `src/app.ts` in the SDK tree).

### 6a. Attaching a UI to a tool result

The association lives on the **tool definition**, not on the tool result ([spec §Resource Discovery](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx#resource-discovery); code at `src/spec.types.ts:761-778`):

```jsonc
// tools/list response — what the host sees at connect time
{
  "name": "cost_entry_form",
  "description": "...",
  "inputSchema": { /* ... */ },
  "_meta": {
    "ui": {
      "resourceUri": "ui://cost-entry/form.html",
      "visibility": ["model", "app"]   // default; can restrict
    }
  }
}
```

The host reads `_meta.ui.resourceUri` at `tools/list` time (not on every call). On the next `tools/call` for that tool, the host fetches the resource via `resources/read`:

```jsonc
// resources/read response for the ui:// URI
{
  "contents": [{
    "uri": "ui://cost-entry/form.html",
    "mimeType": "text/html;profile=mcp-app",   // MUST be this exact type
    "text": "<!doctype html>…",
    "_meta": {
      "ui": {
        "csp": { "connectDomains": [], "resourceDomains": [] },
        "prefersBorder": true
      }
    }
  }]
}
```

The MIME type `text/html;profile=mcp-app` is the opt-in signal — a host that doesn't advertise this MIME in its `McpUiClientCapabilities.mimeTypes` MUST NOT render the resource as an app (spec §Content Requirements). Host default CSP if `_meta.ui.csp` is omitted: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none';` (spec §Content Requirements §Host Behavior).

### 6b. Tool-result flow into the view

Once the iframe is mounted and the view calls `ui/initialize` → the host pushes two host→view notifications with the *tool data* (spec §Lifecycle §2, `src/spec.types.ts:278-304`):

| Method | Direction | Payload |
|---|---|---|
| `ui/notifications/tool-input-partial` (0..n) | Host → View | Streaming tool args as Claude generates them |
| `ui/notifications/tool-input` | Host → View | Final complete args (on commit) |
| `ui/notifications/tool-result` | Host → View | `CallToolResult` — the server's response |
| `ui/notifications/tool-cancelled` | Host → View | If the call was aborted |

The tool-result payload is a standard MCP `CallToolResult`, including `content: ContentBlock[]` (what Claude sees for context) and optionally `structuredContent: Record<string, unknown>` (what the view renders — rich, model-context-free). The `structuredContent` channel is the intended pathway for an app to receive parsed invoice data (the spec explicitly calls this out in `docs/overview.md` §Lifecycle §3 "Data delivery").

### 6c. Submission round-trip

The submission path is **not** a new message type — it's a regular MCP `tools/call` initiated by the view, proxied by the host to the server (spec §Lifecycle §3 "Interactive Phase", sequence-diagram step `UI ->> H: tools/call; H ->> S: tools/call`). Concretely, from inside the iframe:

```ts
// inside the view bundle
const app = new App({ name: "cost-entry-form", version: "0.1.0" });
await app.connect(new PostMessageTransport());
// …render, let the operator edit…
const result = await app.callServerTool("record_cost", { /* args */ });
```

`app.callServerTool` sends a JSON-RPC `tools/call` over `postMessage`; the host's `AppBridge` forwards it over the *same* MCP session to the server. This means our existing Worker-side auth (`authenticateRequest({ acceptsToken: "oauth_token" })`) covers view-initiated calls for free — the session is the same session that was authenticated on the initial `/mcp` POST. **The view does not mint its own credentials.**

Two submission patterns worth naming:

- **Model-visible submission.** `record_cost` stays `visibility: ["model", "app"]` (default). Outcome: the model sees the successful cost-recorded result in its context and can respond to the operator ("OK, recorded — let me know if you want me to chase the invoice"). This is what we want 80% of the time.
- **App-only submission.** A hidden tool `confirm_cost_entry_form` with `visibility: ["app"]` (spec §Visibility, `src/spec.types.ts:756`; host MUST NOT include it in `tools/list` for the agent — spec line 400). Useful if the view wants a "discard" or "save draft" action that shouldn't clutter the model's context. Probably not needed for M3.

Auxiliary view → host messages that do **not** round-trip to the server:

- `ui/message` — send a chat message on the user's behalf (`content: ContentBlock[]`). Good for "Here's the invoice you asked about" after the form submits.
- `ui/update-model-context` — silently update the agent's context without triggering a follow-up. Good for "this cost is now the operator's focus scope."
- `ui/open-link`, `ui/download-file` — UI affordances that require host mediation.

---

## 7. Security, sandbox, and auditability

**Answer.** The security model is strong *by default* and aligns with our "auth at the `/mcp` boundary" invariant ([`packages/mcp-server/CLAUDE.md`](../../packages/mcp-server/CLAUDE.md) §Invariants):

- **Iframe sandbox.** Views run in sandboxed iframes with no same-origin server (spec §Security Implications). The view cannot reach host DOM/cookies/localStorage. Cross-frame communication is `postMessage` only — auditable in principle.
- **Declarative CSP.** Server declares `connectDomains` / `resourceDomains` / `frameDomains` / `baseUriDomains` in `_meta.ui.csp`. Host MUST enforce; MAY restrict further; MUST NOT loosen (spec §Content Requirements §Host Behavior). Undeclared origins are blocked by the browser, not by any trust in the view code.
- **Stable origin option.** If we later need an external API to allowlist the view (we don't for M3), `_meta.ui.domain` produces a deterministic `{hash}.claudemcpcontent.com` subdomain via the SDK's `computeAppDomainForClaude` helper.
- **Auth-free view.** The view never holds a credential. All server calls from the view travel over the same MCP session that was authenticated by Clerk on the initial `/mcp` request, proxied through the host. ADR 0012's "every `/mcp*` request is authenticated before `McpAgent`" invariant is automatically upheld because view-initiated `tools/call` enters via the same `/mcp` endpoint.
- **No `nodejs_compat` change.** The server helpers are pure TS (Q5 confirmed zero `node:*` imports). No new Worker surface area.

**One thing to watch.** Document preview in the left pane (`iframe src=<signed R2 URL>`) requires `frameDomains` to include our R2 presigned-URL host. That exposes the *signed URL* to the view (readable from `document.location` inside the preview iframe, though not from the outer cost-entry view due to cross-origin isolation). Signed URLs are short-lived and scoped to a single object, so the blast radius is bounded — but we should document this in the ADR.

---

## 8. Recommended shape for `apps/cost-entry-form`

**Answer.** Scaffolding outline, not final code. The ADR will ratify; this is the concrete thing Max is ratifying.

### 8a. Package layout (new `apps/` workspace)

```
apps/cost-entry-form/
├── src/
│   ├── main.tsx          # App class + PostMessageTransport bootstrap + React root
│   ├── Form.tsx          # the actual form component (useApp hook)
│   ├── types.ts          # typed CostEntryProps matching TOOLS.md §5.1
│   └── styles.css        # uses --color-* / --font-* CSS vars from hostContext
├── index.html            # Vite entry; vite-plugin-singlefile inlines everything
├── vite.config.ts        # singlefile bundle
├── package.json          # private, type: module, @gc-erp/cost-entry-form
├── tsconfig.json
└── CLAUDE.md             # per packages/CLAUDE.md — "what this app does"
```

The app is *not* a package under `packages/` because it doesn't run on the Worker — it ships as a bundled HTML string embedded into the Worker. But its source needs a home: `apps/<name>/` is the natural place, and the scope-nouns naming rule ([`packages/CLAUDE.md`](../../packages/CLAUDE.md)) extends cleanly (`cost-entry-form`, `job-dashboard`, `pay-app-preview`).

### 8b. Build pipeline

1. `apps/cost-entry-form/` builds with Vite + `vite-plugin-singlefile` to produce one self-contained `dist/cost-entry-form.html` (inline JS + CSS, no external asset refs).
2. `packages/mcp-server` imports that HTML at build time via esbuild's `text` loader (or Vite's `?raw`): `import costEntryFormHtml from "@gc-erp/cost-entry-form/dist/cost-entry-form.html";`
3. `registerAppResource` returns the inlined string at `resources/read` time — no filesystem access at request time (Workers can't `fs.readFile`; Q5 landmine).

### 8c. Server-side registration (shape, not final)

```ts
// packages/mcp-server/src/tools/cost_entry_form.ts — sketch
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import costEntryFormHtml from "@gc-erp/cost-entry-form/dist/cost-entry-form.html";

const RESOURCE_URI = "ui://cost-entry/form.html";

export function registerCostEntryFormApp(server: McpServer) {
  registerAppTool(
    server,
    "cost_entry_form",
    {
      description: "Render the cost-entry form for a draft cost.",
      inputSchema: CostEntryFormInput.shape,
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args) => {
      const resolved = await resolveDraftContext(args, db());
      return {
        content: [{ type: "text", text: "Opening cost-entry form…" }],
        structuredContent: resolved,  // rich data for the view
      };
    },
  );

  registerAppResource(
    server,
    "Cost Entry Form",
    RESOURCE_URI,
    { description: "Form for confirming a draft Cost before writing." },
    async () => ({
      contents: [{
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,   // "text/html;profile=mcp-app"
        text: costEntryFormHtml,
        _meta: { ui: { prefersBorder: true } },
      }],
    }),
  );
}
```

### 8d. Submission round-trip

View submits by calling `app.callServerTool("record_cost", { … })` — the model-visible `record_cost` tool already landed ([TOOLS.md §3.3](../../TOOLS.md)). No new submission tool needed. If we later want a "discard" action that doesn't round-trip through the model, add a `discard_cost_entry_draft` with `visibility: ["app"]`.

### 8e. Progressive enhancement

On server init, branch on `getUiCapability(server.server.getClientCapabilities())`:

- Capability present + MIME `text/html;profile=mcp-app` advertised → register `cost_entry_form` app tool alongside plain `record_cost`.
- Capability absent → don't register the app tool; the operator experience is text-only `record_cost` calls. No regression for clients that predate the extension.

### 8f. Recommendation

**Adopt `@modelcontextprotocol/ext-apps@1.6.0` for M3.** The SDK is stable-spec, Worker-compatible (0 Node-only deps), cheap (+4.3 KB gz), and authors-of-record for the extension — rolling our own would fork us from hosts we're about to dogfood on. Scaffold the app at `apps/cost-entry-form/` using the React subpath + Vite singlefile. Inline the bundled HTML into the Worker at build time to sidestep the SDK examples' `fs.readFile` pattern. Register the app tool behind `getUiCapability()` so non-UI hosts keep working. Timebox the `minimumReleaseAgeExcludes` exception for v1.6.0 to 2026-04-21 (when it clears the 7-day window).

---

## 9. Open follow-ups

Things this spike surfaces but does not resolve. These become backlog entries or get folded into the ADR, not this file:

- **Dev-loop for the app.** The SDK's `examples/basic-host` is Node-only (`npm run start` on port 8080). For iterating on `cost-entry-form` without deploying to Cloudflare + reconnecting Claude Desktop each round, we either (a) stand up `basic-host` locally against `wrangler dev`'s `/mcp` endpoint, or (b) lean on Claude Desktop's "Add custom MCP server" pointed at localhost via mcp-remote (already working for bearer-auth Desktop dogfood per [`docs/guides/dogfood.md`](../../docs/guides/dogfood.md)). **Pick before M3 sprint.**
- **App versioning / cache.** `ui://cost-entry/form.html` is a stable URI. When we ship an app change, hosts may have cached the old HTML. Spec allows `notifications/resources/updated` to invalidate; Claude Desktop's caching behavior for UI resources is not documented. **Test in the first dogfood round.**
- **R2 preview domain in CSP.** §4 and §7 flagged that the left-pane document preview needs R2's presigned domain in `frameDomains`. The ADR should decide: inline-base64 (simple but size-capped) vs. allowlist-R2 (requires the signed-URL host to be stable). Leaning inline-base64 for v1 since M3 PDFs are typically <1 MB.
- **`structuredContent` size budget.** The view receives the full resolved draft (`scope`, `commitment`, `activity`, `counterparty`) via `structuredContent`. A picker that needs the *list* of commitments filtered by scope is either (a) server-shipped on first render (payload bloat) or (b) view-fetched via `app.callServerTool("list_commitments", …)` (one extra round-trip). **Decide per-field once we wire the real UI.**
- **`ui/update-model-context` after submit.** After a successful `record_cost`, should the view push "focus scope = s_demo" as model context so Claude continues the session with that scope pinned? Spec explicitly supports it; product call.
- **Mobile / claude.ai ship order.** Per memory, claude.ai is M3-follow-up, not M3-core. The spike does not address whether the iframe-sandbox-proxy handshake has any `2026-01-26` spec footnotes we'd hit only on mobile (e.g., `safeAreaInsets` respecting, `deviceCapabilities.touch` default target sizes). Verify when claude.ai parity comes into scope.

---

## 10. ADR seed

> **Adopt `@modelcontextprotocol/ext-apps@1.6.0` as the MCP Apps SDK for `cost_entry_form` (M3) and for subsequent apps (`job_dashboard` M4, `pay_app_preview` M5).** Scaffold a new `apps/cost-entry-form/` workspace that builds a single-file HTML bundle via Vite + `vite-plugin-singlefile`; the Worker inlines that HTML at build time and serves it via `registerAppResource` on `ui://cost-entry/form.html`. Register `cost_entry_form` via `registerAppTool` gated on `getUiCapability()` so non-UI hosts keep working with plain `record_cost`. Submission round-trips as a model-visible `tools/call` to the existing `record_cost` tool — no new submission surface, no new auth path. Worker bundle cost: +4.3 KB gzipped, zero `node:*` imports, no `nodejs_compat` flag change. Accept the 7-day quarantine violation for v1.6.0 as a timeboxed exception via `bunfig.toml` `minimumReleaseAgeExcludes`, dropped once v1.6.0 clears the window on 2026-04-21. Alternatives rejected: hand-rolled protocol (weeks of spec-re-implementation work), mcp-ui (pre-SEP; would force a port later), and waiting for a non-Anthropic SDK alternative (none credible exists). The decision opens the door for M4 and M5 apps to reuse the same scaffolding — the `apps/` convention is the permanent shape, not a one-off for M3.
