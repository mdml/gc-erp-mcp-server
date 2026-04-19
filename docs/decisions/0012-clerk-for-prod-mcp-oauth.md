---
type: ADR
id: "0012"
title: "Clerk for prod MCP OAuth — hosted consent eliminates Path B"
status: active
supersedes: "0010"
date: 2026-04-19
---

## Context

[ADR 0010](0010-stytch-oauth-for-prod-mcp.md) chose Stytch Connected Apps for prod `/mcp*` OAuth on 2026-04-18. The coding slice ([PR #28](https://github.com/mdml/gc-erp-mcp-server/pull/28)) shipped to `feat/dogfood-prep` on 2026-04-19 as "Path A" — `/authorize` blindly 302s to `https://stytch.com/oauth/authorize`. End-to-end verification via claude.ai Custom Connectors surfaced **"The Connected App requested could not be found"** at the consent step. See [retro](../retros/2026-04-19-stytch-path-a-false-start.md).

Diagnosis: Stytch's per-project OIDC discovery with the dashboard's Authorization URL cleared returned `authorization_endpoint_not_configured_for_project`. Definitive proof that Stytch **Consumer** Connected Apps requires customer-hosted consent — there is no vendor-hosted consent mode. ADR 0010 was written assuming Stytch hosts the consent UI end-to-end; it does not.

The customer-hosted consent implementation ("Path B") is ~200–400 LOC of security-sensitive Worker code: consent HTML, email-OTP login UI, session cookies (httpOnly/Secure/SameSite + CSRF binding), two SDK calls (`idp.oauth.authorizeStart` preflight + `idp.oauth.authorize` commit), plus tests. **This is the same cost profile ADR 0010 rejected Option B (`@cloudflare/workers-oauth-provider`) for.** The "Easier > no hand-rolled security-sensitive code" claim in the original ADR turned out miscalibrated.

A timeboxed spike (2026-04-19, ~1h) re-examined Clerk — originally named as the pre-selected successor in ADR 0010 Option C. Findings:

- **Clerk hosts the consent page end-to-end for DCR clients.** `POST /oauth_applications` exposes `consentScreenEnabled` defaulting to `true` and **cannot be disabled for dynamically registered apps** (quoted from Clerk's official docs via `/clerk/clerk-docs` on Context7). The inverse of Stytch Consumer — consent is mandatory-on at the vendor.
- `@clerk/backend` officially supports V8 isolates runtimes (Cloudflare Workers) alongside Node ≥20.9.0.
- `@clerk/mcp-tools` ships `/express` + `/next` adapters. No official Workers adapter — the slice ports Express patterns (`mcpAuthClerk` middleware + `/.well-known` handlers) to plain fetch.
- Open toolchain rough edges: [#18 dev-instance authorize-flow redirect_url bug](https://github.com/clerk/mcp-tools/issues/18), [#22 missing OIDC config handler](https://github.com/clerk/mcp-tools/issues/22), incomplete metadata-helper note in the `@clerk/mcp-tools` README. Real, not production-blocking, may require upstream issues/PRs.
- The "beta" label on `clerk.com/docs/guides/ai/mcp/clerk-mcp-server` refers to **Clerk's own hosted MCP server** (the `mcp.clerk.com` endpoint AI agents query for Clerk docs) — not Clerk's auth-for-your-MCP-server functionality. Distinct products. Max confirmed after the spike.

## Decision

**Supersede ADR 0010. Adopt Clerk as the OAuth 2.1 authorization server for production `/mcp*`.** Clerk's hosted consent for DCR clients eliminates the ~200–400 LOC of security-sensitive customer-hosted code Path B would require. Local dev keeps the static bearer-token gate — selector changes from `env.STYTCH_PROJECT_ID` to the Clerk-equivalent env var (decided in the coding slice).

Production bearer path stays retired. Local bearer path stays.

## Options considered

- **A (chosen): Switch to Clerk.** Hosted consent eliminates Path B hand-rolled UI + session work. `@clerk/backend` is Workers-compatible. Port `@clerk/mcp-tools/express` patterns to plain fetch.
- **B (rejected): Stick with Stytch, ship Path B.** Known wiring shape, partner-proven on Cloudflare. Rejected because paying ~200–400 LOC of security-sensitive code contradicts the rationale in ADR 0010 for picking a managed OAuth AS in the first place.
- **C (rejected): Self-host via `@cloudflare/workers-oauth-provider`.** Same rejection as ADR 0010 Option B — shared identity only, zero portfolio reusability.
- **D (rejected): WorkOS / Auth0 / Descope / etc.** Already considered in ADR 0010; trade-offs unchanged. Auth0 DCR is Enterprise-only (pricing-killer); WorkOS is B2B-shaped; Descope's visual flow builder is heavier UX for two-operator dogfood.

## Consequences

**Easier:**

- Clerk hosts consent UI, email flow, session, JWT minting. Worker owns discovery metadata + JWT validation + tool dispatch — roughly the shape of PR #28's non-`handleAuthorize` code.
- Clerk's free tier allows **unlimited applications** under a single instance (vs. Stytch's single-project 10k-MAU pool). Each future MCP server Max ships plugs in with no per-server MAU contention.
- No customer-hosted consent/OTP UI to security-review or maintain.
- Per-user `claims.sub` identity preserved (Clerk mints the JWT, same as the Stytch plan).

**Harder:**

- **No official Cloudflare Workers adapter in `@clerk/mcp-tools`.** We port Express patterns. `@clerk/backend`'s V8 isolates support is documented; verify `nodejs_compat` coverage in the slice's pre-flight before grinding.
- **Rough toolchain edges.** Open issues (#18, #22) and an incomplete metadata-helper note. Plan on filing issues or small PRs upstream. Not production-blocking.
- **Second vendor migration in 48 hours.** Stytch live project stays provisioned as rollback safety net until Clerk is green end-to-end. After that, delete the Stytch project and rotate secrets out of 1Password.
- Fixed scope vocabulary (`profile`, `email`, `public_metadata`, `private_metadata`, `openid`). Fine for dogfood; revisit if per-tool scopes ever matter.
- PR #28's Stytch-specific code (`auth.ts` Stytch client, discovery-doc Stytch URLs, `STYTCH_PROJECT_ID` selector) requires a Clerk-shaped rewrite. Skeleton (routing, `/.well-known` shape, local-bearer fallback, handler DI) is reusable.

**Rollback plan:**

If the Clerk slice hits a hard technical blocker (e.g., `@clerk/backend` won't load under `nodejs_compat`, or `authServerMetadataHandlerClerk` is unusable without upstream changes), revert to **Stytch Path B**. The Path B prompt in PROMPTS.md is being overwritten by the Clerk prompt — reconstructable from ADR 0010 §Implementation notes + the [retro](../retros/2026-04-19-stytch-path-a-false-start.md) + PR #28's current code (handler.ts `handleAuthorize`, auth.ts `validateStytchJwt`). Stytch secrets + live project config stay in 1Password and in the Stytch dashboard until the Clerk slice lands. Rollback is a vendor swap + secret rotation; the discovery/routing skeleton survives either choice.

**Trigger for re-evaluation:**

- Clerk free-tier pricing changes materially. Stytch is now the pre-selected successor (reversed from ADR 0010).
- Clerk's MCP toolchain matures an official Workers adapter — revisit ADR shape (not the vendor choice).
- A future MCP server hits a Clerk-specific integration boundary that's worse than Stytch's equivalent — stand up per-project, don't churn this repo.

## Advice

Re-litigated on 2026-04-19 after Path A's false start surfaced the Pattern A/B consent-hosting asymmetry ADR 0010 hadn't factored in. Spike research (Context7 against `/clerk/clerk-docs`, web search, GitHub issue scan, and the `@clerk/mcp-tools` README) found Clerk's docs explicitly quoting the mandatory-consent-for-DCR behavior. Max confirmed the "beta" banner he'd seen was on Clerk's own hosted MCP server product, not on Clerk's auth functionality. Spike file (`docs/spikes/clerk-hosted-consent.md`) deleted per convention once this ADR landed.

Principle codified for the next OAuth vendor evaluation: **probe the consent-hosting partition before committing.** ADR 0010 assumed uniformity across managed OAuth AS vendors — it is not uniform; each vendor makes a different hosted-vs-customer-hosted choice, and the distinction is decision-dominant for a Cloudflare Worker MCP server.
