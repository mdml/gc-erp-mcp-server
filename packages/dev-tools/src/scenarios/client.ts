/**
 * MCP client for the scenario runner. Thin wrapper over
 * `@modelcontextprotocol/sdk`'s `Client` + `StreamableHTTPClientTransport`
 * that:
 *
 *   - injects the bearer header on every HTTP request,
 *   - returns `structuredContent` (the typed payload the server emits
 *     alongside text) so scenarios get plain objects instead of
 *     MCP-wrapped `CallToolResult`,
 *   - maps `isError: true` results into thrown errors carrying the server's
 *     `{ code, message, details }` JSON so scenarios can assert on the
 *     tool-layer contract (TOOLS.md §1) without unwrapping text blocks.
 *
 * ADR 0004 §Decision: this layer exists to talk to `bun run dev` over real
 * HTTP — the in-memory transport variant was explicitly rejected because
 * the demo value comes from a second pane showing Worker logs.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Structural shape of what we read from a CallTool response — deliberately
// minimal so we don't depend on whether the SDK returns CallToolResult or
// the compatibility variant that includes `toolResult`.
interface CallResponse {
  content?: unknown;
  isError?: boolean;
  structuredContent?: unknown;
}

export interface ScenarioClientOptions {
  url: string;
  bearer: string;
}

export interface ScenarioClient {
  /** Call a tool and return its structured output, or throw on isError. */
  call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  /** List the server's registered tools (handy for a startup banner). */
  listTools(): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}

export class ScenarioToolError extends Error {
  constructor(
    readonly toolName: string,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(`[${toolName}] ${code}: ${message}`);
    this.name = "ScenarioToolError";
  }
}

function readTextBlock(block: unknown): string | null {
  if (!block || typeof block !== "object") return null;
  const b = block as { type?: unknown; text?: unknown };
  if (b.type !== "text" || typeof b.text !== "string") return null;
  return b.text;
}

function extractErrorText(res: CallResponse): string {
  const content = res.content;
  const first = Array.isArray(content) ? content[0] : null;
  return readTextBlock(first) ?? JSON.stringify(res);
}

function parseToolError(name: string, text: string): ScenarioToolError {
  try {
    const parsed = JSON.parse(text) as {
      code?: string;
      message?: string;
      details?: unknown;
    };
    return new ScenarioToolError(
      name,
      parsed.code ?? "unknown",
      parsed.message ?? text,
      parsed.details,
    );
  } catch {
    return new ScenarioToolError(name, "unknown", text);
  }
}

export async function connectMcp(
  opts: ScenarioClientOptions,
): Promise<ScenarioClient> {
  const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
    requestInit: { headers: { Authorization: `Bearer ${opts.bearer}` } },
  });
  const client = new Client({
    name: "gc-erp-scenario-runner",
    version: "0.0.1",
  });
  await client.connect(transport);

  return {
    async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
      // The SDK's callTool returns a union that includes a legacy
      // compatibility variant; read through a minimal structural lens.
      const res = (await client.callTool({
        name,
        arguments: args,
      })) as CallResponse;
      if (res.isError) throw parseToolError(name, extractErrorText(res));
      return res.structuredContent as T;
    },
    async listTools() {
      const res = await client.listTools();
      return res.tools.map((t) => ({ name: t.name }));
    },
    async close() {
      await client.close();
    },
  };
}
