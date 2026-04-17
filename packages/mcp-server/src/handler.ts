import { timingSafeEqual } from "./auth";

interface Env {
  MCP_BEARER_TOKEN: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
}

export interface McpFetcher {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

const BANNER =
  "gc-erp-mcp-server\nPOST /mcp with Authorization: Bearer <token>\n";

export function makeFetchHandler(
  mcp: McpFetcher,
): (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> {
  return async function fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return new Response(BANNER, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      const expected = env.MCP_BEARER_TOKEN
        ? `Bearer ${env.MCP_BEARER_TOKEN}`
        : null;
      const got = req.headers.get("authorization") ?? "";
      if (!expected || !timingSafeEqual(got, expected)) {
        return new Response("unauthorized\n", {
          status: 401,
          headers: { "www-authenticate": 'Bearer realm="gc-erp"' },
        });
      }
      return mcp.fetch(req, env, ctx);
    }

    return new Response("not found\n", { status: 404 });
  };
}
