import { describe, expect, it, vi } from "vitest";
import type { StytchClaims, StytchValidator } from "./auth";
import { type McpFetcher, makeFetchHandler } from "./handler";

interface TestEnv {
  MCP_BEARER_TOKEN?: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  STYTCH_PROJECT_ID?: string;
  STYTCH_SECRET?: string;
}

function makeLocalEnv(token: string | undefined = "super-secret"): TestEnv {
  return {
    MCP_BEARER_TOKEN: token,
    MCP_OBJECT: {} as unknown as DurableObjectNamespace,
    DB: {} as unknown as D1Database,
  };
}

function makeProdEnv(projectId = "project-test-abc"): TestEnv {
  return {
    MCP_OBJECT: {} as unknown as DurableObjectNamespace,
    DB: {} as unknown as D1Database,
    STYTCH_PROJECT_ID: projectId,
    STYTCH_SECRET: "secret-test-xyz",
  };
}

function stubMcp(body = "mcp-ok", status = 200): McpFetcher {
  return {
    fetch: vi.fn(async () => new Response(body, { status })),
  };
}

function makeClaims(overrides: Partial<StytchClaims> = {}): StytchClaims {
  return {
    subject: "user-test-abc",
    scope: "openid profile email",
    audience: "connected-app-client-id",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    issued_at: Math.floor(Date.now() / 1000),
    issuer: "https://test.stytch.com",
    not_before: Math.floor(Date.now() / 1000),
    token_type: "access_token",
    custom_claims: {},
    ...overrides,
  };
}

function okValidator(claims: StytchClaims = makeClaims()) {
  return vi.fn<StytchValidator>(async () => ({ claims }));
}

function rejectingValidator() {
  return vi.fn<StytchValidator>(async () => {
    throw new Error("jwt_validation_failed");
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

describe("/mcp — local mode (no STYTCH_PROJECT_ID)", () => {
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

  it("GET /authorize returns 404 in local mode", async () => {
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
});

describe("/mcp — prod mode (STYTCH_PROJECT_ID set)", () => {
  it("valid JWT → 200 + claims attached to ctx.props + delegated", async () => {
    const mcp = stubMcp("delegated");
    const claims = makeClaims({ subject: "user-test-max" });
    const validator = okValidator(claims);
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
      "eyJvalid.jwt.token",
      expect.objectContaining({ STYTCH_PROJECT_ID: "project-test-abc" }),
    );
    expect(
      (prodCtx as unknown as { props: { claims: StytchClaims } }).props.claims
        .subject,
    ).toBe("user-test-max");
  });

  it("invalid JWT → 401 with resource_metadata_uri WWW-Authenticate", async () => {
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
});

describe("GET /.well-known/oauth-authorization-server — prod mode", () => {
  it("returns 200 JSON with required fields pointing at Stytch (test host for project-test)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://gc.leiserson.me/.well-known/oauth-authorization-server",
        { method: "GET" },
      ),
      makeProdEnv("project-test-abc"),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe("https://gc.leiserson.me");
    expect(body.authorization_endpoint).toBe(
      "https://gc.leiserson.me/authorize",
    );
    expect(body.token_endpoint).toBe(
      "https://test.stytch.com/v1/public/project-test-abc/oauth2/token",
    );
    expect(body.registration_endpoint).toBe(
      "https://test.stytch.com/v1/public/project-test-abc/oauth2/register",
    );
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.grant_types_supported).toContain("authorization_code");
  });

  it("uses api.stytch.com for project-live project IDs", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://gc.leiserson.me/.well-known/oauth-authorization-server",
        { method: "GET" },
      ),
      makeProdEnv("project-live-xyz"),
      ctx,
    );

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token_endpoint).toBe(
      "https://api.stytch.com/v1/public/project-live-xyz/oauth2/token",
    );
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
});

describe("/authorize — prod mode", () => {
  it("GET forwards query params to Stytch's hosted consent page (302)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request(
        "https://gc.leiserson.me/authorize?response_type=code&client_id=c&redirect_uri=https%3A%2F%2Fapp%2Fcb&state=xyz",
        { method: "GET", redirect: "manual" },
      ),
      makeProdEnv(),
      ctx,
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const loc = new URL(location as string);
    expect(loc.origin).toBe("https://stytch.com");
    expect(loc.pathname).toBe("/oauth/authorize");
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("client_id")).toBe("c");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(loc.searchParams.get("state")).toBe("xyz");
  });

  it("POST also accepted (clients may send either)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/authorize?response_type=code", {
        method: "POST",
        redirect: "manual",
      }),
      makeProdEnv(),
      ctx,
    );
    expect(res.status).toBe(302);
  });

  it("PUT returns 405 with Allow header", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/authorize", { method: "PUT" }),
      makeProdEnv(),
      ctx,
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, POST");
  });
});
