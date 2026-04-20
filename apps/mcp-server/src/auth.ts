import { createClerkClient } from "@clerk/backend";

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface ClerkEnv {
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
}

export interface ClerkAuth {
  userId: string;
  scopes: string[];
  clientId: string;
}

export type ClerkValidator = (
  req: Request,
  env: ClerkEnv,
) => Promise<ClerkAuth | null>;

/* v8 ignore start -- Clerk SDK boundary: constructs a client and delegates
   JWT validation + JWKS fetch. Unit tests inject a stub ClerkValidator via
   makeFetchHandler deps; exercising this directly would mean running Clerk's
   JWKS flow against a live instance. */
export const validateClerkOauthToken: ClerkValidator = async (req, env) => {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) {
    throw new Error("Clerk is not configured");
  }
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
  const state = await clerk.authenticateRequest(req, {
    acceptsToken: "oauth_token",
  });
  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  return {
    userId: auth.userId,
    scopes: [...auth.scopes],
    clientId: auth.clientId,
  };
};
/* v8 ignore stop */

// Clerk encodes the Frontend API URL in the publishable key itself — strip the
// `pk_(test|live)_` prefix, base64-decode, strip the trailing `$`. Mirrors
// @clerk/mcp-tools' deriveFapiUrl. Pure + deterministic, so discovery-doc and
// protected-resource handlers can derive it without a Clerk API call.
export function deriveFapiUrl(publishableKey: string): string {
  const key = publishableKey.replace(/^pk_(test|live)_/, "");
  const decoded = atob(key);
  return `https://${decoded.replace(/\$/, "")}`;
}
