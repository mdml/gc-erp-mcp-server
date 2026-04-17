import { describe, expect, it, vi } from "vitest";
import { type McpFetcher, makeFetchHandler } from "./handler";

interface TestEnv {
  MCP_BEARER_TOKEN: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
}

function makeEnv(token = "super-secret"): TestEnv {
  return {
    MCP_BEARER_TOKEN: token,
    MCP_OBJECT: {} as unknown as DurableObjectNamespace,
    DB: {} as unknown as D1Database,
  };
}

function stubMcp(body = "mcp-ok", status = 200): McpFetcher {
  return {
    fetch: vi.fn(async () => new Response(body, { status })),
  };
}

const ctx = {} as ExecutionContext;

describe("makeFetchHandler", () => {
  it("GET / returns 200 with the banner and text/plain", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/", { method: "GET" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("gc-erp-mcp-server");
    expect(body).toContain("POST /mcp");
  });

  it("POST /mcp without Authorization returns 401 + WWW-Authenticate", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", { method: "POST" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("POST /mcp with a wrong bearer returns 401", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer nope" },
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("POST /mcp with a same-length wrong bearer returns 401 (exercises byte-wise compare)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer SUPER-SECRET" },
      }),
      makeEnv("super-secret"),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("requests to /mcp/<subpath> also require auth", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp/sse", { method: "GET" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("POST /mcp with the correct bearer delegates to mcp.fetch", async () => {
    const mcp = stubMcp("delegated");
    const fetch = makeFetchHandler(mcp);
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret" },
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("delegated");
    expect(mcp.fetch).toHaveBeenCalledTimes(1);
  });

  it("unknown path returns 404", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/nope", { method: "GET" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("empty MCP_BEARER_TOKEN rejects every /mcp request (safer default than allowing)", async () => {
    const fetch = makeFetchHandler(stubMcp());
    const res = await fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer anything" },
      }),
      makeEnv(""),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});
