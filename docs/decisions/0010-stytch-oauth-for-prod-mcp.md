---
type: ADR
id: "0010"
title: "Stytch Connected Apps for MCP OAuth in prod"
status: active
date: 2026-04-18
---

## Context

M2 landed on `main` and the server is live at `https://gc.leiserson.me` behind a static bearer-token gate (`Authorization: Bearer $MCP_BEARER_TOKEN`, constant-time compared via [`timingSafeEqual`](../../packages/mcp-server/src/auth.ts)). The [`now.md`](../product/now.md) top task is "prod deploy + dogfood"; [`dogfood.md`](../guides/dogfood.md) documents a flow that pastes the bearer token into Claude Desktop's config JSON and into claude.ai's Custom Connectors UI.

That plan is partially broken. Verification (2026-04-18):

- **Claude Desktop** accepts static `Authorization: Bearer …` headers via `claude_desktop_config.json` — works today.
- **claude.ai (web + iOS + Android) Custom Connectors** do **not** accept static bearer headers. They implement OAuth 2.1 strictly per the [MCP authorization spec](https://blog.modelcontextprotocol.io/posts/client_registration/): the client fetches `/.well-known/oauth-authorization-server`, registers itself via Dynamic Client Registration (RFC 7591), then runs the authorization-code flow. A server that only offers bearer-in-header gets rejected at discovery.

This blocks cross-device dogfood on mobile/web — which is the explicit point of dogfooding ahead of M6 ("Run a real job"). The [ARCHITECTURE §8](../guides/ARCHITECTURE.md) deferred item "OAuth — current bearer token is fine for two operators; migrate when we cross ~3 users" was based on an incorrect premise: the trigger isn't user-count, it's client-mix. As soon as one operator wants to use claude.ai, we need OAuth.

Secondary context — from [scope.md](../product/scope.md) and Max's stated intent during this session, `gc-erp-mcp-server` is likely the first of several MCP servers Max will build across projects. The auth choice should be a pattern that ports, not a one-off for this repo.

## Decision

**Adopt Stytch Connected Apps as the OAuth 2.1 authorization server for production `/mcp*`, with email OTP as the sole login method behind the consent page. Local dev (`wrangler dev`, scenario runner) keeps the existing bearer-token gate.** Stytch hosts `/token` and `/register` (DCR); the Worker exposes `/.well-known/oauth-authorization-server` pointing at them plus a local `/authorize` route that renders a Stytch-backed consent page. Incoming `/mcp*` bearers are Stytch-issued JWTs validated via the Stytch SDK; `getMcpAuthContext()` exposes the authenticated user's `claims.sub` to tool handlers.

The production bearer path is retired. The local bearer path stays, gated on `env.STYTCH_PROJECT_ID` absence — prod sets the secret, local doesn't.

**Login-method scope:** the consent page offers **email OTP only** — a one-time 6-digit passcode sent to the user's email, typed back into the consent page. No magic links (click-a-URL-in-email), no passwords, no social logins, no enterprise SSO. This is a Stytch dashboard setting, not Worker code — we configure the project's login methods at provisioning time. Fits the two-operator dogfood shape (Max + Salman both have known emails; no password to remember, no SSO to manage) and keeps the authentication surface minimal. If/when a third operator or a real customer lands, expanding to magic links or an upstream IdP is a Stytch-dashboard toggle — no code change.

## Options considered

- **A (chosen): Stytch Connected Apps.** Cloudflare-partnered ([announcement, 2025-04-07](https://siliconangle.com/2025/04/07/stytch-cloudflare-partner-secure-remote-mcp-servers-oauth/)); officially listed in [Cloudflare's MCP Authorization docs](https://developers.cloudflare.com/agents/model-context-protocol/authorization/); a co-built Workers+MCP template demonstrating OAuth + DCR end-to-end exists ([Stytch blog](https://stytch.com/blog/building-an-mcp-server-oauth-cloudflare-workers/)). 10k-MAU free tier. No new Cloudflare-bound resources (no KV, no DO state for OAuth). One new runtime dep (`stytch` SDK), two new secrets (`STYTCH_PROJECT_ID`, `STYTCH_SECRET`).
- **B: `@cloudflare/workers-oauth-provider` with shared-password default handler.** Self-host the OAuth AS on the Worker. No new vendor; matches existing "age + direnv + 1Password = auth" ethos. **Rejected** because (a) ~100 lines of hand-rolled consent page + KV-backed state tokens + CSRF-binding cookies + SHA-256 state hashing is security-sensitive code we'd own and test forever; (b) single shared "friend" identity instead of per-user `claims.sub`; (c) portfolio-reusability is zero — a Workers-specific pattern doesn't help Max's next MCP server if it lives on Vercel or bare Node; (d) MCP auth spec is mid-churn ([CIMD landed Nov 2025](https://blog.modelcontextprotocol.io/posts/client_registration/)) and a managed provider absorbs that churn.
- **C: Clerk.** Cross-runtime strongest; unlimited-apps-free tier tailor-made for a portfolio of MCP servers; "AI-agent-first" redesign in 2026. [Context7 migrated to Clerk for MCP in production](https://upstash.com/blog/mcp-oauth-implementation). **Not chosen** because (a) Clerk is absent from Cloudflare's officially-documented provider list, so the Workers-MCP integration is community-proven rather than partner-proven; (b) on a Cloudflare-heavy practice, Stytch's co-built template is a real operational advantage. Reserved as the most likely successor if Stytch's multi-project pricing (single-workspace 10k MAU pool) starts binding.
- **D: WorkOS AuthKit.** Cloudflare-documented; org-first B2B shape. **Rejected** — overbuilt for two-operator dogfood; better fit when/if a project becomes multi-tenant SaaS.
- **E: Auth0.** DCR is [Enterprise-only on Auth0](https://auth0.com/ai/docs/mcp/guides/registering-your-mcp-client-application). Pricing-killer for dogfood; eliminates the option.
- **F: Cloudflare Access.** Zero Trust JWT-at-edge. **Rejected** — not an OAuth 2.1 AS with DCR in the shape MCP clients expect; solves a different problem.
- **G: Descope.** Cloudflare-documented; "leads in MCP support" per one 2026 CIAM ranking. **Not chosen** — visual flow builder is heavier UX for a two-operator case than Stytch's more code-centric Connected Apps.

## Consequences

**Easier:**

- Claude.ai web, iOS, and Android can connect to prod via OAuth — the dogfood unblocker.
- Tool handlers get real per-user identity (`getMcpAuthContext().claims.sub` from the Stytch JWT) instead of "whoever has the shared token." Opens per-user audit, per-user defaults, and per-user data partitioning if we ever need them.
- No new Cloudflare infra to provision (no KV namespace, no DO storage for OAuth state). Stytch's hosted endpoints replace all the stateful pieces.
- Portfolio reusability — the pattern (Stytch Connected Apps + Worker `/.well-known` + SDK-validated bearer) carries to every future MCP server Max ships on Cloudflare.
- MCP auth spec churn (DCR → CIMD transition, per the [MCP OAuth blog post](https://blog.modelcontextprotocol.io/posts/client_registration/)) is absorbed by Stytch, not by us.

**Harder:**

- New runtime dep (`stytch` SDK) grows `packages/mcp-server`'s Worker bundle. Quantify during the implementation slice; Cloudflare Workers bundle size limit (10 MB on Free / 15 MB on Paid) is far from binding, but `nodejs_compat` polyfill cost matters.
- Two new secrets (`STYTCH_PROJECT_ID`, `STYTCH_SECRET`) join the 1Password `gc-erp` vault and need `turbo.json` `globalPassThroughEnv` declarations — Turbo 2.x strips env vars by default (per [`packages/dev-tools/CLAUDE.md`](../../packages/dev-tools/CLAUDE.md)).
- Bifurcated auth path: prod validates Stytch JWT, local validates static bearer. Selector is `env.STYTCH_PROJECT_ID` presence. Kept deliberately narrow — one branch, one function (`validateAuth`), covered by tests on both arms. Alternative considered (OAuth-everywhere, including scenario runner) rejected: local D1 holds no real data, scenario runner is server-to-server and OAuth'ing it means a programmatic DCR dance per script invocation.
- Stytch outage = prod MCP outage. Mitigations: (a) scenario runner hits local, unaffected; (b) Stytch's uptime is competitive with Cloudflare's and independent of it (different vendor, different datacenters); (c) Claude Desktop users can temporarily fall back to the local config.
- Claude Desktop prod config loses the static `Authorization: Bearer …` header; it now does the DCR dance like claude.ai does. Slightly more one-time setup per device, but Desktop handles it natively.

**Trigger for re-evaluation:**

- Stytch free-tier shrinks below our actual MAU usage across Max's MCP portfolio (unlikely near-term; today it's 2 users, and the cap is 10k).
- CIMD supplants DCR in the MCP spec and Stytch lags the migration — would force either waiting or vendor swap. Mitigation: Stytch is actively participating in the MCP spec process, lag risk is low.
- A second MCP server project hits a Cloudflare-specific integration boundary that the Stytch pattern doesn't cover — we'd stand up the per-project pattern separately rather than abandon Stytch for this repo.
- Stytch pricing or terms change materially. Clerk is the pre-selected successor (Option C); migration is a fetch-handler swap, not a re-architecture.

## Implementation notes (for the follow-up coding slice)

Out of scope for this ADR (it's the decision, not the wiring), but to keep the coding-slice planner honest:

- The [Stytch+Workers blog example](https://stytch.com/blog/building-an-mcp-server-oauth-cloudflare-workers/) uses the older **SSE transport** (`McpAgent.mount('/sse')`). Our code uses the newer **streamable HTTP** (`McpAgent.serve("/mcp")`). Verify the pattern at implementation time — likely a one-line swap, but untested.
- The Stytch example uses Hono as the Worker router; we use a plain `fetch` handler factory (`makeFetchHandler` in [`packages/mcp-server/src/handler.ts`](../../packages/mcp-server/src/handler.ts)). Keep the plain-fetch pattern.
- Stytch replaces `@cloudflare/workers-oauth-provider` entirely in this setup; do **not** combine them.
- Local-mode bearer check stays in `handler.ts`; prod-mode JWT validation is a new branch gated on `env.STYTCH_PROJECT_ID`.
- No KV binding, no DO migration for OAuth. If a `stytch` helper wants KV for caching JWKS, add it then — not preemptively.
- **Verify email-OTP-only is a per-project Stytch dashboard setting.** At provisioning time, disable every other login method on the Stytch project (magic links, passwords, OAuth social logins, SSO, WebAuthn). The Stytch docs describe email OTP as a first-class product with dedicated API endpoints + configurable 1–10 minute expiration ([Stytch Email OTP docs](https://stytch.com/docs/guides/passwordless/email-otps)), but "Connected Apps consent page restricted to exactly one login method" is not something I verified end-to-end by clicking through the dashboard — the coding slice should confirm before declaring the path green. If the dashboard doesn't offer clean per-method toggles, fall back to a project-level allowlist of enabled methods or surface it as a risk.

## Advice

Researched during this session (2026-04-18): Cloudflare's five officially-documented MCP OAuth providers (Cloudflare Access, Stytch, Auth0, WorkOS, Descope), plus Clerk (community-proven on Workers via Context7's production deployment). Max chose Stytch after considering Clerk as the runner-up; tradeoffs discussed in the options section above.
