import type { IntrospectTokenClaims } from "stytch";
import * as stytch from "stytch";

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StytchEnv {
  STYTCH_PROJECT_ID?: string;
  STYTCH_SECRET?: string;
}

export type StytchClaims = IntrospectTokenClaims;

export type StytchValidator = (
  token: string,
  env: StytchEnv,
) => Promise<{ claims: StytchClaims }>;

/* v8 ignore start -- Stytch SDK boundary: constructs a client and delegates
   JWT validation + JWKS fetch. Unit tests inject a stub StytchValidator via
   makeFetchHandler deps; exercising this directly would mean running jose's
   JWKS flow against a live Stytch project. */
export const validateStytchJwt: StytchValidator = async (token, env) => {
  if (!env.STYTCH_PROJECT_ID || !env.STYTCH_SECRET) {
    throw new Error("Stytch is not configured");
  }
  const client = new stytch.Client({
    project_id: env.STYTCH_PROJECT_ID,
    secret: env.STYTCH_SECRET,
  });
  const claims = await client.idp.introspectTokenLocal(token);
  return { claims };
};
/* v8 ignore stop */

export function stytchPublicBase(projectId: string): string {
  const host = projectId.startsWith("project-live-")
    ? "https://api.stytch.com"
    : "https://test.stytch.com";
  return `${host}/v1/public/${projectId}`;
}
