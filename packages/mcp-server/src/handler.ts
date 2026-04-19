import {
  type StytchClaims,
  type StytchValidator,
  stytchPublicBase,
  timingSafeEqual,
  validateStytchJwt,
} from "./auth";

interface Env {
  MCP_BEARER_TOKEN?: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  STYTCH_PROJECT_ID?: string;
  STYTCH_SECRET?: string;
}

export interface McpFetcher {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

const BANNER =
  "gc-erp-mcp-server\nPOST /mcp — prod: OAuth 2.1 + DCR via Stytch · local: Authorization: Bearer <token>\n";

const UNAUTH_WWW_AUTH_PROD =
  'Bearer resource_metadata_uri=".well-known/oauth-protected-resource"';
const UNAUTH_WWW_AUTH_LOCAL = 'Bearer realm="gc-erp"';

const NOT_FOUND = (): Response => new Response("not found\n", { status: 404 });

const METHOD_NOT_ALLOWED = (allow: string): Response =>
  new Response("method not allowed\n", {
    status: 405,
    headers: { allow },
  });

function isProdMode(env: Env): boolean {
  return Boolean(env.STYTCH_PROJECT_ID);
}

function oauthAuthorizationServerMetadata(
  originUrl: URL,
  projectId: string,
): object {
  const origin = `${originUrl.protocol}//${originUrl.host}`;
  const stytchBase = stytchPublicBase(projectId);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${stytchBase}/oauth2/token`,
    registration_endpoint: `${stytchBase}/oauth2/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
  };
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function unauthorized(env: Env): Response {
  return new Response("unauthorized\n", {
    status: 401,
    headers: {
      "www-authenticate": isProdMode(env)
        ? UNAUTH_WWW_AUTH_PROD
        : UNAUTH_WWW_AUTH_LOCAL,
    },
  });
}

function handleDiscovery(url: URL, req: Request, env: Env): Response {
  if (!isProdMode(env)) return NOT_FOUND();
  if (req.method !== "GET") return METHOD_NOT_ALLOWED("GET");
  // isProdMode verifies STYTCH_PROJECT_ID is set.
  const projectId = env.STYTCH_PROJECT_ID as string;
  return jsonResponse(oauthAuthorizationServerMetadata(url, projectId));
}

function handleAuthorize(url: URL, req: Request, env: Env): Response {
  if (!isProdMode(env)) return NOT_FOUND();
  if (req.method !== "GET" && req.method !== "POST") {
    return METHOD_NOT_ALLOWED("GET, POST");
  }
  // Hand off to Stytch's hosted consent UI (Connected Apps). Query params
  // from the MCP client — response_type, client_id, redirect_uri,
  // code_challenge, state, scope, … — forward verbatim. Stytch's consent
  // page runs the email-OTP login per ADR 0010.
  const stytchAuthorize = new URL("https://stytch.com/oauth/authorize");
  for (const [k, v] of url.searchParams) {
    stytchAuthorize.searchParams.append(k, v);
  }
  return Response.redirect(stytchAuthorize.toString(), 302);
}

interface McpDeps {
  mcp: McpFetcher;
  validator: StytchValidator;
}

async function handleMcp(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: McpDeps,
): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";

  if (isProdMode(env)) {
    const claims = await authenticateStytch(authHeader, env, deps.validator);
    if (!claims) return unauthorized(env);
    // McpAgent reads request-scoped auth props from ctx.props — the
    // agents/mcp binding exposes them to tool handlers via
    // getMcpAuthContext(). The binding does not expose typed props on
    // ExecutionContext, so a cast is the documented pattern.
    (ctx as unknown as { props: unknown }).props = { claims };
    return deps.mcp.fetch(req, env, ctx);
  }

  const expected = env.MCP_BEARER_TOKEN
    ? `Bearer ${env.MCP_BEARER_TOKEN}`
    : null;
  if (!expected || !timingSafeEqual(authHeader, expected)) {
    return unauthorized(env);
  }
  return deps.mcp.fetch(req, env, ctx);
}

async function authenticateStytch(
  authHeader: string,
  env: Env,
  validator: StytchValidator,
): Promise<StytchClaims | null> {
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (!token) return null;
  try {
    const { claims } = await validator(token, env);
    return claims;
  } catch {
    return null;
  }
}

export interface HandlerDeps {
  validator?: StytchValidator;
}

export function makeFetchHandler(
  mcp: McpFetcher,
  deps: HandlerDeps = {},
): (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> {
  const mcpDeps: McpDeps = {
    mcp,
    validator: deps.validator ?? validateStytchJwt,
  };

  return async function fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return new Response(BANNER, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return handleDiscovery(url, req, env);
    }

    if (url.pathname === "/authorize") {
      return handleAuthorize(url, req, env);
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return handleMcp(req, env, ctx, mcpDeps);
    }

    return NOT_FOUND();
  };
}
