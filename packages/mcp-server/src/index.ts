import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { makeFetchHandler } from "./handler";

interface Env {
  MCP_BEARER_TOKEN: string;
  MCP_OBJECT: DurableObjectNamespace;
}

export class GcErpMcp extends McpAgent<Env> {
  server = new McpServer({
    name: "gc-erp",
    version: "0.0.1",
  });

  /* v8 ignore start -- TODO(coverage): test tools via in-memory MCP server */
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
  /* v8 ignore stop */
}

const mcp = GcErpMcp.serve("/mcp", { binding: "MCP_OBJECT" });

export default {
  fetch: makeFetchHandler(mcp),
} satisfies ExportedHandler<Env>;
