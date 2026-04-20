import { describe, expect, it, vi } from "vitest";
import type { ClerkAuth, ClerkValidator } from "./auth";
import { type McpFetcher, makeFetchHandler } from "./handler";

interface TestEnv {
  MCP_BEARER_TOKEN?: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
}

function makeLocalEnv(token: string | undefined = "super-secret"): TestEnv {
  return {
    MCP_BEARER_TOKEN: token,
    MCP_OBJECT: {} as unknown as DurableObjectNamespace,
    DB: {} as unknown as D1Database,
  };
}

// Publishable key encodes `clerk.gc.leiserson.me$` as base64 → pk_live_...
// The discovery-doc proxy and protected-resource handler derive Clerk's FAPI
// URL from this value, so fixture env matches what Clerk actually issues.
const TEST_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuZ2MubGVpc2Vyc29uLm1lJA";
const TEST_FAPI_URL = "https://clerk.gc.leiserson.me";

function makeProdEnv(
  publishableKey: string = TEST_PUBLISHABLE_KEY,
  secretKey = "sk_live_test-secret",
): TestEnv {
  return {
    MCP_OBJECT: {} as unknown as DurableObjectNamespace,
    DB: {} as unknown as D1Database,
    CLERK_SECRET_KEY: secretKey,
    CLERK_PUBLISHABLE_KEY: publishableKey,
  };
}

function stubMcp(body = "mcp-ok", status = 200): McpFetcher {
  return {
    fetch: vi.fn(async () => new Response(body, { status })),
  };
}

function makeAuth(overrides: Partial<ClerkAuth> = {}): ClerkAuth {
  return {
    userId: "user_test_abc",
    scopes: ["profile", "email"],
    clientId: "client_test_xyz",
    ...overrides,
  };
}

function okValidator(auth: ClerkAuth = makeAuth()) {
  return vi.fn<ClerkValidator>(async () => auth);
}

function rejectingValidator() {
  return vi.fn<ClerkValidator>(async () => null);
}

function throwingValidator() {
  return vi.fn<ClerkValidator>(async () => {
    throw new Error("jwks_fetch_failed");
  });
}

const ctx = {} as ExecutionContext;

describe("GET /", () => {
  it("returns 200 text/plain with the banner", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/", { method: "GET" }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("gc-erp-mcp-server");
    expect(body).toContain("POST /mcp");
  });
});

describe("unknown path", () => {
  it("returns 404", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/nope", { method: "GET" }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("/mcp — local mode (no CLERK_SECRET_KEY)", () => {
  it("missing Authorization returns 401 with local WWW-Authenticate", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", { method: "POST" }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('realm="gc-erp"');
  });

  it("wrong bearer returns 401", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer nope" },
      }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("same-length wrong bearer returns 401 (exercises constant-time compare)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer SUPER-SECRET" },
      }),
      makeLocalEnv("super-secret"),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("/mcp/<subpath> also requires auth", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp/sse", { method: "GET" }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("correct bearer delegates to mcp.fetch", async () => {
    const mcp = stubMcp("delegated");
    const fetch = makeFetchHandler(mcp);
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret" },
      }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("delegated");
    expect(mcp.fetch).toHaveBeenCalledTimes(1);
  });

  it("empty MCP_BEARER_TOKEN rejects every /mcp request (safer default)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer anything" },
      }),
      makeLocalEnv(""),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("GET /.well-known/oauth-authorization-server returns 404 in local mode", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://example.com/.well-known/oauth-authorization-server",
        { method: "GET" },
      ),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("GET /.well-known/oauth-protected-resource returns 404 in local mode", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/.well-known/oauth-protected-resource", {
        method: "GET",
      }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("GET /authorize is a plain 404 in local mode (no authorize route exists)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/authorize?response_type=code", {
        method: "GET",
      }),
      makeLocalEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("partial Clerk config (only CLERK_SECRET_KEY) falls into local mode: discovery 404s", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://example.com/.well-known/oauth-authorization-server",
        { method: "GET" },
      ),
      {
        MCP_OBJECT: {} as unknown as DurableObjectNamespace,
        DB: {} as unknown as D1Database,
        CLERK_SECRET_KEY: "sk_live_test-secret",
      },
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("partial Clerk config (only CLERK_PUBLISHABLE_KEY) falls into local mode: discovery 404s", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://example.com/.well-known/oauth-authorization-server",
        { method: "GET" },
      ),
      {
        MCP_OBJECT: {} as unknown as DurableObjectNamespace,
        DB: {} as unknown as D1Database,
        CLERK_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
      },
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("/mcp — prod mode (CLERK_SECRET_KEY set)", () => {
  it("valid JWT → 200 + auth attached to ctx.props + delegated", async () => {
    const mcp = stubMcp("delegated");
    const auth = makeAuth({ userId: "user_test_max" });
    const validator = okValidator(auth);
    const fetch = makeFetchHandler(mcp, { validator });

    const prodCtx = { ...ctx } as ExecutionContext;
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer eyJvalid.jwt.token" },
      }),
      makeProdEnv(),
      prodCtx,
    );

    expect(res.status).toBe(200);
    expect(mcp.fetch).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ CLERK_SECRET_KEY: "sk_live_test-secret" }),
    );
    expect(
      (prodCtx as unknown as { props: { auth: ClerkAuth } }).props.auth.userId,
    ).toBe("user_test_max");
  });

  it("invalid JWT (validator returns null) → 401 with resource_metadata_uri WWW-Authenticate", async () => {
    const mcp = stubMcp();
    const validator = rejectingValidator();
    const fetch = makeFetchHandler(mcp, { validator });

    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer eyJbad.jwt.token" },
      }),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata_uri=".well-known/oauth-protected-resource"',
    );
    expect(mcp.fetch).not.toHaveBeenCalled();
  });

  it("validator throws → 401 (JWKS failure is not a 500 to the client)", async () => {
    const mcp = stubMcp();
    const validator = throwingValidator();
    const fetch = makeFetchHandler(mcp, { validator });

    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer eyJvalid.jwt.token" },
      }),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(mcp.fetch).not.toHaveBeenCalled();
  });

  it("missing Authorization header → 401 (no validator call)", async () => {
    const mcp = stubMcp();
    const validator = okValidator();
    const fetch = makeFetchHandler(mcp, { validator });

    const res = await fetch(
      new Request("https://example.com/mcp", { method: "POST" }),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(validator).not.toHaveBeenCalled();
    expect(mcp.fetch).not.toHaveBeenCalled();
  });

  it("Authorization header without Bearer prefix → 401 (no validator call)", async () => {
    const mcp = stubMcp();
    const validator = okValidator();
    const fetch = makeFetchHandler(mcp, { validator });

    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(validator).not.toHaveBeenCalled();
  });

  it("empty Bearer token → 401 (no validator call)", async () => {
    const mcp = stubMcp();
    const validator = okValidator();
    const fetch = makeFetchHandler(mcp, { validator });

    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer " },
      }),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(validator).not.toHaveBeenCalled();
  });
});

describe("GET /.well-known/oauth-authorization-server — prod mode", () => {
  it("proxies Clerk's FAPI discovery doc verbatim", async () => {
    const upstreamBody = JSON.stringify({
      issuer: TEST_FAPI_URL,
      authorization_endpoint: `${TEST_FAPI_URL}/oauth/authorize`,
      token_endpoint: `${TEST_FAPI_URL}/oauth/token`,
      registration_endpoint: `${TEST_FAPI_URL}/oauth/register`,
      jwks_uri: `${TEST_FAPI_URL}/.well-known/jwks.json`,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      const fetch = makeFetchHandler(stubMcp());
      const res = await fetch(
        new Request(
          "https://gc.leiserson.me/.well-known/oauth-authorization-server",
          { method: "GET" },
        ),
        makeProdEnv(),
        ctx,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.issuer).toBe(TEST_FAPI_URL);
      expect(body.jwks_uri).toBe(`${TEST_FAPI_URL}/.well-known/jwks.json`);
      expect(body.registration_endpoint).toBe(
        `${TEST_FAPI_URL}/oauth/register`,
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_FAPI_URL}/.well-known/oauth-authorization-server`,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("non-GET method returns 405", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://example.com/.well-known/oauth-authorization-server",
        { method: "POST" },
      ),
      makeProdEnv(),
      ctx,
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("GET");
  });

  it("upstream Clerk FAPI returns non-2xx → status passes through with cache-control: no-store", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream boom", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );
    try {
      const fetch = makeFetchHandler(stubMcp());
      const res = await fetch(
        new Request(
          "https://gc.leiserson.me/.well-known/oauth-authorization-server",
          { method: "GET" },
        ),
        makeProdEnv(),
        ctx,
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("upstream boom");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("upstream Clerk FAPI unreachable → 502 with cache-control: no-store", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network"));
    try {
      const fetch = makeFetchHandler(stubMcp());
      const res = await fetch(
        new Request(
          "https://gc.leiserson.me/.well-known/oauth-authorization-server",
          { method: "GET" },
        ),
        makeProdEnv(),
        ctx,
      );
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ error: "upstream_unavailable" });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("GET /.well-known/oauth-protected-resource — prod mode", () => {
  it("returns 200 JSON with Clerk-shaped protected-resource metadata", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://gc.leiserson.me/.well-known/oauth-protected-resource",
        { method: "GET" },
      ),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("https://gc.leiserson.me/");
    expect(body.authorization_servers).toEqual([TEST_FAPI_URL]);
    expect(body.jwks_uri).toBe(`${TEST_FAPI_URL}/.well-known/jwks.json`);
    expect(body.token_introspection_endpoint).toBe(
      `${TEST_FAPI_URL}/oauth/token`,
    );
    const challenges = body.key_challenges_supported as Array<{
      challenge_algs: string[];
    }>;
    expect(challenges[0].challenge_algs).toContain("S256");
  });

  it("non-GET method returns 405", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/.well-known/oauth-protected-resource", {
        method: "POST",
      }),
      makeProdEnv(),
      ctx,
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("GET");
  });
});
