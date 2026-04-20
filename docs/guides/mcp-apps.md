# MCP Apps — vendor guide

> **What to trust in this guide.** Written from a disposable POC session 2026-04-20 against [`@modelcontextprotocol/ext-apps@1.6.0`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) (published 2026-04-14) + [`@modelcontextprotocol/sdk@1.29.0`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) + [`agents@0.11.0`](https://www.npmjs.com/package/agents) on a scratch Cloudflare Worker. Everything labeled **verified** was driven end-to-end through wrangler + curl against a live `/mcp` session; everything labeled **unverified** is documented from spec or SDK source but not exercised through a real host (Claude Desktop, claude.ai). When you adopt MCP Apps in `apps/cost-entry-form/`, start by closing the unverified rows.
>
> The deeper dive (rendering model, CSP, security, bundle-cost analysis) lives in [spike 0001](../spikes/0001-mcp-apps-sdk.md). This guide is the *thin, action-oriented* companion — how to actually make one of these things work in our Worker.

## 1. What MCP Apps is

An MCP extension (SEP-1865, [spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx), extension identifier `io.modelcontextprotocol/ui`) that lets an MCP server attach an interactive HTML UI — a "View" — to a tool. The host (Claude Desktop, claude.ai) fetches the HTML via `resources/read` on a `ui://` URI and renders it inline in a sandboxed iframe. The View talks back to the host via `postMessage`; the host proxies MCP calls to our server over the same authenticated session.

**Three roles:** server (our Worker registers the tool + the HTML resource), host (Claude Desktop/claude.ai mounts the iframe), view (the HTML + JS bundle using `App` + `PostMessageTransport` from the SDK).

## 2. Minimal working server shape

The smallest thing that actually rendered end-to-end in the POC. Compiles, bundles, and `tools/list` / `resources/read` return the right shapes.

```ts
// Worker entry — uses agents' McpAgent (same as apps/mcp-server/).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
// @ts-expect-error — wrangler's Text loader returns string (see §6.4)
import VIEW_HTML from "./view.html";

const RESOURCE_URI = "ui://hello/view.html";

export class HelloAgent extends McpAgent<Env> {
  server = new McpServer({ name: "hello", version: "0.1.0" });

  async init() {
    registerAppTool(
      this.server,
      "hello_app",
      {
        title: "Hello",
        description: "Opens a hello form.",
        inputSchema: { greeting: z.string().optional() },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async ({ greeting }) => ({
        content: [{ type: "text", text: `Opening hello (${greeting ?? "hi"})…` }],
        structuredContent: { greeting: greeting ?? "hi" }, // rich data for the view
      }),
    );

    // Plain tool that the view submits to via app.callServerTool.
    this.server.registerTool(
      "record_hello",
      { description: "Record a greeting.", inputSchema: { name: z.string() } },
      async ({ name }) => ({ content: [{ type: "text", text: `Recorded ${name}.` }] }),
    );

    // registerAppResource is 5-arg positional: (server, name, uri, config, handler).
    // (The 3-arg object form in some skill docs is not what 1.6.0 ships. See §6.1.)
    registerAppResource(
      this.server,
      "Hello View",
      RESOURCE_URI,
      { description: "Hello form." },
      async () => ({
        contents: [{
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE, // "text/html;profile=mcp-app"
          text: VIEW_HTML as unknown as string,
          _meta: { ui: { csp: { resourceDomains: [] }, prefersBorder: true } },
        }],
      }),
    );
  }
}
```

`wrangler.jsonc` needs a Text-loader rule and a DO binding for `McpAgent`:

```jsonc
{
  "rules": [{ "type": "Text", "globs": ["**/*.html"], "fallthrough": false }],
  "durable_objects": { "bindings": [{ "name": "MCP_OBJECT", "class_name": "HelloAgent" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["HelloAgent"] }]
}
```

**peerDependencies (from the installed 1.6.0):** `@modelcontextprotocol/sdk ^1.29.0`, `zod ^3.25.0 || ^4.0.0`. We run zod 4.3.6, so we're fine. **Don't pin zod below 3.25** — the POC first installed 3.24 and `registerAppTool` hit `TS2589: Type instantiation is excessively deep` until we bumped. The error message doesn't point at the zod version.

## 3. Minimal working view shape

The view is one HTML file containing a JS module that constructs an `App`, registers handlers, and calls `connect(new PostMessageTransport())`. Order matters — **register handlers before `connect`** because events can fire immediately.

```html
<!doctype html>
<html><body>
<form id="f"><input id="name" value="world" /><button>Submit</button></form>
<script type="module">
  import { App, PostMessageTransport } from "https://esm.sh/@modelcontextprotocol/ext-apps@1.6.0";
  const app = new App({ name: "hello", version: "0.1.0" });
  app.ontoolinput = (p) => console.log("tool-input", p);    // args from Claude
  app.ontoolresult = (r) => console.log("tool-result", r);  // CallToolResult
  app.onhostcontextchanged = (ctx) => { /* theme/locale/platform */ };
  app.onteardown = async () => ({});
  await app.connect(new PostMessageTransport());
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    await app.callServerTool({ name: "record_hello", arguments: { name: name.value } });
  });
</script></body></html>
```

**Production slice:** bundle the view with Vite + [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile) so the SDK code is inlined (no esm.sh at runtime → no extra CSP domain). Spike 0001 §8b has the Vite config.

## 4. Dev loop

From the scratch POC: the server-side loop is fast and works on the same session. The host-side loop is the unverified part.

| Change | What you do | What happens |
|---|---|---|
| Edit Worker code | wrangler dev hot-reloads on save | New handler runs on next request — **verified** (POC, 2026-04-20) |
| Edit the view HTML | wrangler dev picks up the change via the Text-loader rule | Next `resources/read` returns the new HTML on the same MCP session — **verified** via curl re-fetch on the POC |
| Want the host to re-render the view | Emit `notifications/resources/updated` OR reconnect the host | Server can emit the notification (spec-supported); **Desktop's cache behavior on receipt is unverified** |

Concrete POC invocation for a fresh curl-driven check (adapt for your scratch project):

```bash
# pane A
bunx wrangler dev --port 8788 --local        # separate port from the main dev server's 8787

# pane B
curl -sS -D /tmp/h.txt -X POST http://localhost:8788/mcp \
  -H "authorization: Bearer poc" -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}},"clientInfo":{"name":"curl","version":"0"}}}'
SID=$(awk '/mcp-session-id:/ {print $2}' /tmp/h.txt | tr -d '\r\n')
# notifications/initialized, then tools/list, resources/list, resources/read, tools/call — all on the same SID.
```

For Desktop-driven testing, add a **separate** `gc-erp-poc` entry to `claude_desktop_config.json` (distinct name from `gc-erp-local`) pointing `mcp-remote` at `http://localhost:8788/mcp` with the POC bearer. The main dev server's `gc-erp-local` config stays untouched. See [dogfood.md §Claude Desktop config](dogfood.md) for the `mcp-remote` shape — the `--header 'Authorization:${AUTH_HEADER}'` idiom there applies identically.

## 5. Wire-format cheatsheet

The full wire tour is in [spike 0001 §6](../spikes/0001-mcp-apps-sdk.md). The four calls you actually touch on the server:

| Call | Direction | What we send / verify |
|---|---|---|
| `tools/list` result | S → H | `_meta.ui.resourceUri` on the tool entry (SDK also fills `_meta["ui/resourceUri"]` — see §6.2) |
| `resources/read` result | S → H | `mimeType: "text/html;profile=mcp-app"`, inline `text`, optional `_meta.ui.{csp,prefersBorder}` |
| `tools/call` on a plain tool | V → H → S | Same session, same auth. The view doesn't mint credentials. |
| `notifications/resources/updated` | S → H | Tells the host the HTML at a URI changed. Spec-supported; Desktop handling unverified. |

Host → view notifications the view subscribes to via `App` handlers: `ui/notifications/tool-input` (args), `ui/notifications/tool-result` (CallToolResult), `ui/notifications/host-context-changed` (theme/platform/safe-area).

## 6. Gotchas + what the docs got wrong

### 6.1 `registerAppResource` has two documented signatures — only the 5-arg one ships in 1.6.0

Some of the SDK's own skill docs ([`convert-web-app/SKILL.md`](https://github.com/modelcontextprotocol/ext-apps/blob/main/plugins/mcp-apps/skills/convert-web-app/SKILL.md), [`add-app-to-server/SKILL.md`](https://github.com/modelcontextprotocol/ext-apps/blob/main/plugins/mcp-apps/skills/add-app-to-server/SKILL.md)) show `registerAppResource(server, { uri, name, mimeType }, handler)` — a 3-arg object form. The `dist/src/server/index.d.ts` in 1.6.0 declares only the 5-arg positional form used in §2 above. The 3-arg form is either documentation drift or a pre-release signature. Use the 5-arg form; `bun run typecheck` will catch the mistake if you copy the wrong snippet.

### 6.2 `_meta.ui.resourceUri` is mirrored to a legacy flat key

`tools/list` responses carry the URI in both `_meta.ui.resourceUri` (the new shape) and `_meta["ui/resourceUri"]` (legacy flat key with a slash). The SDK does this automatically for host back-compat. Don't set the legacy key yourself — `registerAppTool` fills it.

### 6.3 zod must be ≥ 3.25 (spike only quoted the peerDeps range; treat it as a hard floor)

zod 3.24 compiles the package itself but `registerAppTool` hits `TS2589: Type instantiation is excessively deep` because the SDK's generic input-schema types reach into zod internals that 3.25 introduced. Our repo is on 4.3.6, so we're fine, but new scratch projects that grab `latest` of a narrower zod can hit this.

### 6.4 Wrangler's default HTML handling splits the bundle

Without an explicit `rules` entry, `wrangler deploy --dry-run --outdir dist` emits the view HTML as a separate file (`<hash>-view.html`) alongside `index.js`. That works for deploy, but the `import VIEW_HTML from "./view.html"` typechecks as a binding the runtime resolves — which means **breaking the Worker's "one bundle" posture.** For `apps/mcp-server/` we want the HTML *inlined* into the JS bundle so it ships as a single module. The fix is an explicit Text-loader rule in `wrangler.jsonc` (shown in §2). The spike called out `fs.readFile` as the landmine; the real landmine is "wrangler silently chose a split-assets layout that type-checks."

### 6.5 SDK exports more subpaths than the spike enumerated

`package.json#exports` in 1.6.0: `.`, `./app-with-deps`, `./react`, `./react-with-deps`, `./app-bridge`, `./server`, `./schema.json`. The `*-with-deps` variants bundle the SDK's own dependencies for consumers who can't resolve them — relevant if you ever load the view from a CDN without a bundler. The spike mentioned `.`, `/react`, `/server`; the `with-deps` and `/app-bridge` entries are there if we ever need them (we don't for our current slices).

### 6.6 SDK runtime dependency count: zero

`bun pm view @modelcontextprotocol/ext-apps` shows `deps: 0`. The entire `dist/` has zero `node:*` imports (verified via `grep -rE "from ['\"]node:" dist/`). This is stronger than spike §5 claimed — the spike verified only the `/server` subpath. The engines field says `node >= 20` but it's advisory; the code is Workers-clean.

### 6.7 `App.callServerTool` takes an object, not positional args

Spike 0001 §6c shows the submission-from-view call as `app.callServerTool("record_cost", { /* args */ })` — positional. That shape **does not ship in 1.6.0**. The class declares a single signature in `dist/src/app.d.ts:784`:

```ts
callServerTool(params: CallToolRequest["params"], options?: RequestOptions): Promise<CallToolResult>;
```

`CallToolRequest["params"]` is the MCP SDK's `{ name: string; arguments?: Record<string, unknown>; _meta?: ...; task?: ... }` shape (see `@modelcontextprotocol/sdk/dist/esm/types.d.ts:2727` for the zod schema). So the working call is the object form in §3:

```ts
await app.callServerTool({ name: "record_hello", arguments: { name: "max" } });
```

No overload accepts positional args — there's only the one method. When M3's slice calls `callServerTool` from the cost-entry view, use the object form.

### 6.8 `getUiCapability` at server-init time returns undefined

Our first POC cut called `getUiCapability(server.server.getClientCapabilities())` at construction time and always got `undefined` — because the server hasn't seen the client's `initialize` yet. For our progressive-enhancement pattern, the capability probe needs to run *inside* the `McpAgent.init()` callback after the first message, or be deferred to a per-request branch. Spike §8e's sketch is right in spirit but the exact call-site matters.

## 7. Verified vs unverified

| What | Status | Notes |
|---|---|---|
| SDK 1.6.0 installs with zero runtime deps | **Verified** 2026-04-20 | `bun pm view @modelcontextprotocol/ext-apps` |
| Zero `node:*` imports across the whole `dist/` | **Verified** 2026-04-20 | `grep -rE "from ['\"]node:" dist/` in node_modules |
| Peer-dep floor is `zod ≥ 3.25` in practice | **Verified** 2026-04-20 | zod 3.24 breaks `registerAppTool` type inference |
| `registerAppTool` + `registerAppResource` compile | **Verified** 2026-04-20 | POC `bunx tsc --noEmit` clean |
| Wrangler bundles the Worker with Text-loader rule; HTML inlines | **Verified** 2026-04-20 | `wrangler deploy --dry-run --outdir dist` |
| `tools/list` returns `_meta.ui.resourceUri` on the tool | **Verified** 2026-04-20 | live curl against POC `/mcp` |
| `resources/read` returns `text/html;profile=mcp-app` + `_meta.ui` | **Verified** 2026-04-20 | live curl against POC `/mcp` |
| `tools/call` on a plain tool (submission path) works in-session | **Verified** 2026-04-20 | live curl against POC `/mcp` |
| Server-side dev loop: edit HTML → reload → new `resources/read` | **Verified** 2026-04-20 | bumped a version marker, re-fetched on same session |
| `App.callServerTool` signature against SDK 1.6.0 `.d.ts` | **Verified** 2026-04-20 (static, not exercised end-to-end) | `dist/src/app.d.ts:784` declares one signature: object param, no positional overload. See §6.7. |
| Claude Desktop renders the view end-to-end | **Unverified** — needs human Desktop session | POC didn't drive a real host; blocker to M3 close |
| Desktop honors `notifications/resources/updated` for HTML changes | **Unverified** | Spec supports it; cache behavior undocumented |
| Desktop tolerates `esm.sh` in `resourceDomains` CSP | **Unverified** | Moot once we bundle with Vite singlefile |
| claude.ai web + mobile parity | **Not attempted** | M3 is Desktop-first per project memory |
| `App` + `PostMessageTransport` handshake from a real view | **Unverified** | Requires a real host envelope; agent browser tools can't supply one |

## 8. How to extend

When M3's `slice/cost-entry-form` starts, the concrete path is:

1. Add `@modelcontextprotocol/ext-apps@1.6.0` to `apps/mcp-server/package.json`. **Timebox the 7-day quarantine exception** per [spike 0001 §2](../spikes/0001-mcp-apps-sdk.md): the version clears the window on 2026-04-21, so the `minimumReleaseAgeExcludes` entry in [`bunfig.toml`](../../bunfig.toml) is only needed if the slice lands before then. Verify first with `bun pm view @modelcontextprotocol/ext-apps time`.
2. Scaffold `apps/cost-entry-form/` per spike §8a. The `apps/mcp-server/` Text-loader rule + `import costEntryFormHtml from "@gc-erp/cost-entry-form/dist/cost-entry-form.html"` is the inlining pattern (see §6.4).
3. Gate registration on `getUiCapability()` — but call it *inside* `McpAgent.init()` (or per-request), not at class construction (see §6.8).
4. Close the **unverified** rows in §7 during the first dogfood pass. Any row that stays unverified becomes a backlog entry before the slice merges.

---

Spec, SDK, and reference docs — consult these directly when something here contradicts reality:

- [Spec 2026-01-26 (SEP-1865)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [`@modelcontextprotocol/ext-apps` npm](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) — always check `bun pm view … version` before assuming API shape
- [SDK quickstart](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/quickstart.md) and [migration from OpenAI Apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/migrate_from_openai_apps.md)
- [Spike 0001 — MCP Apps SDK](../spikes/0001-mcp-apps-sdk.md)
