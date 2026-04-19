import { createDatabaseClient } from "@gc-erp/database";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { makeFetchHandler } from "./handler";
import {
  applyPatch,
  createJob,
  createParty,
  createProject,
  createScope,
  ensureActivity,
  getScopeTree,
  issueNtp,
  listJobs,
  listScopes,
  recordCost,
  recordDirectCost,
  registerToolOn,
  updateScope,
} from "./tools";

interface Env {
  MCP_BEARER_TOKEN?: string;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  STYTCH_PROJECT_ID?: string;
  STYTCH_SECRET?: string;
}

export class GcErpMcp extends McpAgent<Env> {
  server = new McpServer({
    name: "gc-erp",
    version: "0.0.1",
  });

  /* v8 ignore start -- workerd-only wiring; tool logic is covered via pure handler tests */
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

    const db = () => createDatabaseClient(this.env.DB);
    registerToolOn(this.server, createProject, db);
    registerToolOn(this.server, createJob, db);
    registerToolOn(this.server, createParty, db);
    registerToolOn(this.server, createScope, db);
    registerToolOn(this.server, updateScope, db);
    registerToolOn(this.server, getScopeTree, db);
    registerToolOn(this.server, listJobs, db);
    registerToolOn(this.server, listScopes, db);
    registerToolOn(this.server, ensureActivity, db);
    registerToolOn(this.server, applyPatch, db);
    registerToolOn(this.server, issueNtp, db);
    registerToolOn(this.server, recordCost, db);
    registerToolOn(this.server, recordDirectCost, db);
  }
  /* v8 ignore stop */
}

const mcp = GcErpMcp.serve("/mcp", { binding: "MCP_OBJECT" });

export default {
  fetch: makeFetchHandler(mcp),
} satisfies ExportedHandler<Env>;
