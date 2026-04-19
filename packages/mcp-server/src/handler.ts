import {
  type ClerkAuth,
  type ClerkValidator,
  deriveFapiUrl,
  timingSafeEqual,
  validateClerkOauthToken,
} from "./auth";

interface Env {
  MCP_BEARER_TOKEN?: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
}

export interface McpFetcher {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

const BANNER =
  "gc-erp-mcp-server\nPOST /mcp — prod: OAuth 2.1 + DCR via Clerk · local: Authorization: Bearer <token>\n";

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
  return Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY);
}

function jsonResponse(body: object, cacheSeconds = 300): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${cacheSeconds}`,
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

// Discovery-doc + protected-resource metadata ported from
// @clerk/mcp-tools' authServerMetadataHandlerClerk + protectedResourceHandlerClerk.
// Source: https://github.com/clerk/mcp-tools/blob/main/src/express/index.ts
async function handleDiscovery(req: Request, env: Env): Promise<Response> {
  if (!isProdMode(env)) return NOT_FOUND();
  if (req.method !== "GET") return METHOD_NOT_ALLOWED("GET");
  const publishableKey = env.CLERK_PUBLISHABLE_KEY as string;
  const fapiUrl = deriveFapiUrl(publishableKey);
  let upstream: Response;
  try {
    upstream = await fetch(`${fapiUrl}/.well-known/oauth-authorization-server`);
  } catch {
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ??
        "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function handleProtectedResource(url: URL, req: Request, env: Env): Response {
  if (!isProdMode(env)) return NOT_FOUND();
  if (req.method !== "GET") return METHOD_NOT_ALLOWED("GET");
  const publishableKey = env.CLERK_PUBLISHABLE_KEY as string;
  const fapiUrl = deriveFapiUrl(publishableKey);
  const origin = `${url.protocol}//${url.host}`;
  return jsonResponse({
    resource: `${origin}/`,
    authorization_servers: [fapiUrl],
    token_types_supported: ["urn:ietf:params:oauth:token-type:access_token"],
    token_introspection_endpoint: `${fapiUrl}/oauth/token`,
    token_introspection_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    jwks_uri: `${fapiUrl}/.well-known/jwks.json`,
    authorization_data_types_supported: ["oauth_scope"],
    authorization_data_locations_supported: ["header", "body"],
    key_challenges_supported: [
      {
        challenge_type: "urn:ietf:params:oauth:pkce:code_challenge",
        challenge_algs: ["S256"],
      },
    ],
    service_documentation: "https://clerk.com/docs",
  });
}

interface McpDeps {
  mcp: McpFetcher;
  validator: ClerkValidator;
}

async function handleMcp(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: McpDeps,
): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";

  if (isProdMode(env)) {
    const auth = await authenticateClerk(req, authHeader, env, deps.validator);
    if (!auth) return unauthorized(env);
    // McpAgent reads request-scoped auth props from ctx.props — the
    // agents/mcp binding exposes them to tool handlers via
    // getMcpAuthContext(). The binding does not expose typed props on
    // ExecutionContext, so a cast is the documented pattern.
    (ctx as unknown as { props: unknown }).props = { auth };
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

async function authenticateClerk(
  req: Request,
  authHeader: string,
  env: Env,
  validator: ClerkValidator,
): Promise<ClerkAuth | null> {
  // fast-path: skip the Clerk SDK construction on obviously malformed headers
  if (!authHeader.startsWith("Bearer ")) return null;
  if (!authHeader.slice("Bearer ".length)) return null;
  try {
    return await validator(req, env);
  } catch {
    return null;
  }
}

export interface HandlerDeps {
  validator?: ClerkValidator;
}

export function makeFetchHandler(
  mcp: McpFetcher,
  deps: HandlerDeps = {},
): (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> {
  const mcpDeps: McpDeps = {
    mcp,
    validator: deps.validator ?? validateClerkOauthToken,
  };

  return async function fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return new Response(BANNER, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return handleDiscovery(req, env);
    }

    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return handleProtectedResource(url, req, env);
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return handleMcp(req, env, ctx, mcpDeps);
    }

    return NOT_FOUND();
  };
}
