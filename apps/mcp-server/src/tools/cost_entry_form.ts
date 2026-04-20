/**
 * cost_entry_form — the repo's first MCP App tool.
 *
 * Exposes `cost_entry_form` as either (a) an MCP Apps app tool with an
 * inline HTML view, if the client advertises `io.modelcontextprotocol/ui`,
 * or (b) a plain text-only tool that returns a formatted summary of the
 * resolved context and suggests calling `record_cost` directly. The tool
 * name is identical across both variants — progressive enhancement, no
 * upstream branching.
 *
 * The capability probe runs inside the low-level server's `oninitialized`
 * callback (per vendor guide §6.8): calling it at McpAgent construction or
 * at the top of `init()` is too early — the client-capabilities map is
 * empty and `getUiCapability` silently returns undefined, which would
 * register the text-only variant for every host.
 *
 * Submission is out of scope here — the view posts to `record_cost` via
 * `app.callServerTool(...)` (view-side only; §6.7). This module only
 * stands up the pre-fill surface.
 */

import type { DatabaseClient } from "@gc-erp/database";
import {
  getUiCapability,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
// @ts-expect-error — wrangler's Text loader returns a string at runtime
// (vendor guide §6.4). Integration swaps this import for the singlefile
// bundle from apps/cost-entry-form/ in a later commit on the slice.
import COST_ENTRY_FORM_HTML from "../cost-entry-form.stub.html";
import { McpToolError } from "./_mcp-tool";
import {
  type CostEntryFormContext,
  CostEntryFormInput,
  resolveCostEntryFormContext,
} from "./cost_entry_form.resolver";

const TOOL_NAME = "cost_entry_form";
const RESOURCE_URI = "ui://cost-entry-form/view.html";

const DESCRIPTION_APP =
  "Open the cost-entry form, pre-filled with whatever context (job, scope, commitment, activity, counterparty, amount, date, memo) is known. The human confirms and submits; the form then calls `record_cost` with the final values.";
const DESCRIPTION_PLAIN =
  "Resolve cost-entry context (job, scope, commitment, activity, counterparty) and return a formatted summary. Host does not support inline UI — follow up by calling `record_cost` with the resolved IDs + the user's amount / incurredOn / memo.";

export function formatFallbackText(ctx: CostEntryFormContext): string {
  const lines = [
    `Cost-entry context resolved for job "${ctx.jobName}" (${ctx.jobId}):`,
  ];
  if (ctx.scopeName !== undefined)
    lines.push(`- scope: ${ctx.scopeName} (${ctx.scopeId})`);
  if (ctx.commitmentLabel !== undefined)
    lines.push(`- commitment: ${ctx.commitmentLabel} (${ctx.commitmentId})`);
  if (ctx.activityName !== undefined)
    lines.push(`- activity: ${ctx.activityName} (${ctx.activityId})`);
  if (ctx.counterpartyName !== undefined)
    lines.push(
      `- counterparty: ${ctx.counterpartyName} (${ctx.counterpartyId})`,
    );
  if (ctx.amount !== undefined)
    lines.push(`- amount: ${ctx.amount.cents} cents ${ctx.amount.currency}`);
  if (ctx.incurredOn !== undefined)
    lines.push(`- incurredOn: ${ctx.incurredOn}`);
  if (ctx.memo !== undefined) lines.push(`- memo: ${ctx.memo}`);
  lines.push("", "Call `record_cost` with these values to persist the cost.");
  return lines.join("\n");
}

export function toErrorResult(err: McpToolError): CallToolResult {
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

export async function runResolver(
  getDb: () => DatabaseClient,
  input: CostEntryFormInput,
): Promise<CostEntryFormContext | McpToolError> {
  try {
    return await resolveCostEntryFormContext(getDb(), input);
  } catch (err) {
    if (err instanceof McpToolError) return err;
    throw err;
  }
}

/**
 * Register `cost_entry_form` on the MCP server. Call this from
 * `McpAgent.init()`. The capability probe is deferred to `oninitialized`
 * on the low-level server, which fires after the client's `initialize`
 * handshake — the earliest point at which `getClientCapabilities()`
 * returns a populated map (vendor guide §6.8).
 */
/* v8 ignore start -- workerd-only wiring; the resolver (the only testable
 * branch) is covered in cost_entry_form.resolver.test.ts. Handler + fallback
 * formatting are thin adapters over the resolver. */
export function registerCostEntryForm(
  server: McpServer,
  getDb: () => DatabaseClient,
): void {
  server.server.oninitialized = () => {
    const uiCap = getUiCapability(server.server.getClientCapabilities());
    const hasUi = uiCap?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;

    if (hasUi) {
      registerAppTool(
        server,
        TOOL_NAME,
        {
          title: "Cost entry form",
          description: DESCRIPTION_APP,
          inputSchema: CostEntryFormInput.shape,
          _meta: {
            ui: {
              resourceUri: RESOURCE_URI,
              prefersBorder: true,
            },
          },
        },
        async (input) => {
          const result = await runResolver(getDb, input as CostEntryFormInput);
          if (result instanceof McpToolError) return toErrorResult(result);
          return {
            content: [{ type: "text", text: "Opening cost-entry form…" }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        },
      );

      registerAppResource(
        server,
        "Cost entry form",
        RESOURCE_URI,
        {
          description:
            "Inline cost-entry form. Pre-fills from context provided by the `cost_entry_form` tool; submits via `record_cost`.",
        },
        async () => ({
          contents: [
            {
              uri: RESOURCE_URI,
              mimeType: RESOURCE_MIME_TYPE,
              text: COST_ENTRY_FORM_HTML as unknown as string,
              _meta: {
                ui: {
                  csp: { resourceDomains: [] },
                  prefersBorder: true,
                },
              },
            },
          ],
        }),
      );
      return;
    }

    // Text-only fallback. Same tool name; different body.
    server.registerTool(
      TOOL_NAME,
      {
        description: DESCRIPTION_PLAIN,
        inputSchema: CostEntryFormInput.shape,
      },
      async (input) => {
        const result = await runResolver(getDb, input as CostEntryFormInput);
        if (result instanceof McpToolError) return toErrorResult(result);
        return {
          content: [{ type: "text", text: formatFallbackText(result) }],
        };
      },
    );
  };
}
/* v8 ignore stop */
