import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface Env {
  MCP_BEARER_TOKEN: string;
  MCP_OBJECT: DurableObjectNamespace;
}

export class GcErpMcp extends McpAgent<Env> {
  server = new McpServer({
    name: "gc-erp",
    version: "0.0.1",
  });

  async init(): Promise<void> {
    this.server.registerTool(
      "ping",
      {
        description:
          "Heartbeat. Returns 'pong' and the server's current time. Use to verify connectivity.",
      },
      async () => ({
        content: [
          {
            type: "text",
            text: `pong ${new Date().toISOString()}`,
          },
        ],
      }),
    );

    this.server.registerTool(
      "list_jobs",
      {
        description:
          "List all jobs across all projects. Returns an empty array until persistence is wired up.",
      },
      async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify([], null, 2),
          },
        ],
      }),
    );
  }
}

const mcp = GcErpMcp.serve("/mcp", { binding: "MCP_OBJECT" });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return new Response(
        "gc-erp-mcp-server\nPOST /mcp with Authorization: Bearer <token>\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
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
  },
} satisfies ExportedHandler<Env>;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
