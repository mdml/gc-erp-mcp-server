---
date: 2026-04-19
slug: stytch-path-a-false-start
---

# Retro — Stytch OAuth shipped as Path A; consent flow needs Path B rebuild

## Context

Session 2 of 2026-04-19. Spawned a worktree agent to implement the Stytch OAuth coding slice per [ADR 0010](../decisions/0010-stytch-oauth-for-prod-mcp.md); PR #28 merged to `feat/dogfood-prep`; Worker deployed; live Stytch project provisioned end-to-end; claude.ai Custom Connector reached Stytch's consent page but errored with "The Connected App requested could not be found." Root cause: PR #28 implemented **Path A** (blind 302 from our `/authorize` to `https://stytch.com/oauth/authorize`) while Stytch Consumer Connected Apps actually requires **Path B** (customer-hosted consent using the SDK's IDP OAuth methods). Session closed with a `wrangler rollback` and a Path B slice queued for the next session.

## Observations

- **PR #28's self-verification item #1 was wrong on the merits and I didn't push back.** The agent wrote "/authorize is a plain 302 redirect to Stytch's hosted consent URL, which avoids porting the blog's Hono consent-page code entirely." That claim is what let Path A ship — the stated invariant from ADR 0010 ("no Hono") was interpreted as "skip the consent-page code" instead of "port to plain fetch." A one-line trace from our `/authorize` to `stytch.com/oauth/authorize`'s actual behavior for Consumer Connected Apps would've caught the mismatch at review time.
- **My review flagged the `/authorize` URL shape as a smoke-time item, not a blocker.** Under time pressure to keep M2 moving, I downgraded the concern. Wrong call — an unknown about the target-state URL of the consent flow IS blocker material for a PR that changes auth. Saved as `feedback_dep_quarantine_bypass` sibling; should capture a separate memory about "prefer smoke-time items → blockers when the unknown touches the critical path."
- **DCR-works-in-isolation ≠ OAuth-works-end-to-end.** I probed the `registration_endpoint` directly with curl and got HTTP 201 + a valid `client_id`. That gave me false confidence that the rest of the flow would just work. The consent step is in a different Stytch partition than the DCR step, so a registered client in the DCR namespace isn't necessarily findable by the consent page.
- **Stytch's own per-project OIDC discovery was the smoking gun.** Fetching `https://api.stytch.com/v1/public/<project-id>/.well-known/openid-configuration` with the Authorization URL cleared returned `authorization_endpoint_not_configured_for_project` — definitive proof Stytch requires a customer-hosted consent entry. This probe should've been step 0 before I reviewed PR #28, not step N during post-deploy debugging.
- **Stytch dashboard state is per-environment (test vs live).** Max initially uploaded test project secrets, then swapped to live — but the dashboard configuration (Connected Apps enabled, DCR enabled, login methods) had to be re-done on the live project separately. Cost ~15 min. Documented in [dogfood.md §Prod deploy checklist](../guides/dogfood.md) step 3 but easy to miss when context-switching between environments; the switch happened mid-debug rather than at setup time.
- **Inline coordination + review + real-time debug worked well despite the bad outcome.** The step-by-step "run this curl, paste output" loop surfaced the root cause in <30 min once we started probing; without that, the diagnosis could've taken a second session.

## Decisions

- **Revert to bearer via `wrangler rollback`**, not a `git revert` of PR #28. Rationale: feat/dogfood-prep keeps the Stytch wiring as a reference for the Path B rebuild (much of the auth.ts + secrets + turbo.json + bunfig plumbing is correct and reusable); rolling back only the Worker binary restores bearer-Desktop dogfood on prod without churning the branch. Docs-ahead-of-code on feat/dogfood-prep stays acceptable per [2026-04-19 oauth-plan retro §Observations](2026-04-19-oauth-plan-and-pr25-dup.md) — current state of `main` is bearer, branch state is aspirational, fine.
- **Path B is the real target** — not "fix the 302 URL." Consumer Connected Apps has no Stytch-hosted-consent mode; the only working architecture is customer-hosted consent using `stytch.idp.oauth.*` SDK methods. Confirmed by probing Stytch's per-project OIDC with Authorization URL cleared.
- **Path B is a proper coding slice, not an inline patch.** Session-cookie management + email-OTP UI + SDK-driven consent-submit + code-mint is security-sensitive code that benefits from a worktree agent's fresh-context PR flow + a separate review pass, not a single-conversation push.

## Actions taken

- Ran end-to-end live smoke that surfaced the broken consent flow.
- Diagnosed via Stytch per-project OIDC probe: Consumer Connected Apps requires customer-hosted consent.
- Drafted the Path B worktree prompt (in the conversation handoff).
- This retro.
- `now.md` updated — Path A crossed off with pointer here; Path B is the new #1.
- Saved memory `feedback_dep_quarantine_bypass.md` earlier in the session about asking-before-flagging on quarantine bypasses (unrelated to the main miss but noted while reviewing PR #28).

## Deferred

- **Path B coding slice** (new `now.md` #1). Spawn a worktree from latest `feat/dogfood-prep`; base-align to `origin/feat/dogfood-prep` before content work (per prior retro's deferred item). Slice prompt in the session handoff. Implementation-wise: `/authorize` handler parses OAuth params, checks session cookie, renders email-OTP login if absent, calls Stytch SDK's IDP OAuth method with authenticated context, renders consent screen, submits approval via SDK, redirects to client's `redirect_uri` with auth code. Also adds `jwks_uri` to `/.well-known` (the known gap from the PR #28 review that rides with Path B).
- **Review-gating habit: "critical-path unknown = blocker, not smoke-time item."** Not yet a codified rule. Candidate for root CLAUDE.md §Session rhythm or a new feedback memory after the Path B slice lands — want to see if the habit holds through a second case before codifying.
- **Worktree base-check as session-open step** (carried from [2026-04-19 oauth-plan retro](2026-04-19-oauth-plan-and-pr25-dup.md) §Deferred). PR #28's base alignment was clean (I verified at review time), so the habit held once. Keep watching.
- **Merge `feat/dogfood-prep → main`** (carried from prior retros) — gated on Path B landing and claude.ai connecting end-to-end.
