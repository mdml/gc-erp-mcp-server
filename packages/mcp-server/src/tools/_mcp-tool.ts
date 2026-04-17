/**
 * Tool wiring — shared by every `src/tools/<name>.ts` module.
 *
 * Each tool exports an {@link McpToolDef} (schema + description + pure
 * handler). {@link registerToolOn} turns that into an MCP `registerTool` call
 * with a thin callback that:
 *   - invokes the handler with a per-request `db`
 *   - serializes the result as JSON text (what Claude reads)
 *   - mirrors the same payload on `structuredContent` (what an MCP client
 *     validates against the output schema)
 *   - maps {@link McpToolError} to an `isError: true` response per TOOLS.md §1
 *
 * Real unexpected errors bubble up so the MCP SDK can surface them as
 * protocol-level errors rather than masking them as tool failures.
 */

import type { DatabaseClient } from "@gc-erp/database";
import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

export type ToolErrorCode =
  | "not_found"
  | "invariant_violation"
  | "validation_error"
  | "dependency_missing";

export class McpToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: unknown;

  constructor(code: ToolErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.details = details;
  }
}

export interface McpToolDef<
  I extends z.ZodType,
  O extends z.ZodObject<z.ZodRawShape>,
> {
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  handler: (args: {
    db: DatabaseClient;
    input: z.output<I>;
  }) => Promise<z.output<O>>;
}

/** Build the MCP callback for a tool. Exposed for direct testing. */
export function buildToolCallback<
  I extends z.ZodType,
  O extends z.ZodObject<z.ZodRawShape>,
>(
  tool: McpToolDef<I, O>,
  getDb: () => DatabaseClient,
): (input: z.output<I>) => Promise<CallToolResult> {
  return async (input) => {
    try {
      const output = await tool.handler({ db: getDb(), input });
      const text = JSON.stringify(output, null, 2);
      return {
        content: [{ type: "text", text }],
        structuredContent: output as Record<string, unknown>,
      };
    } catch (err) {
      if (err instanceof McpToolError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { code: err.code, message: err.message, details: err.details },
                null,
                2,
              ),
            },
          ],
        };
      }
      throw err;
    }
  };
}

/**
 * Register a tool on an {@link McpServer}. `getDb` is called once per tool
 * call so the handler sees a fresh drizzle client bound to the Worker's
 * request-scoped D1 binding.
 */
export function registerToolOn<
  I extends z.ZodType,
  O extends z.ZodObject<z.ZodRawShape>,
>(
  server: McpServer,
  tool: McpToolDef<I, O>,
  getDb: () => DatabaseClient,
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    },
    // The MCP SDK's `ToolCallback` is a conditional type keyed off the
    // input-schema generic. Our generic is broader (`z.ZodType`), so TS can't
    // collapse the conditional and we cast at the boundary. The handler-side
    // generics remain precise via `McpToolDef`.
    buildToolCallback(tool, getDb) as unknown as ToolCallback<
      typeof tool.inputSchema
    >,
  );
}
