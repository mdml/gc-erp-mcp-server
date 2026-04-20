/**
 * cost_entry_form — the repo's first MCP App tool.
 *
 * Registers `cost_entry_form` as an MCP Apps app tool with an inline HTML
 * view. UI-capable hosts (Claude Desktop, claude.ai) read `_meta.ui` and
 * render the view inline; text-only hosts ignore `_meta.ui` and see the
 * `content[0].text` summary plus the same `structuredContent` (which they
 * can act on by calling `record_cost` directly).
 *
 * Submission is out of scope here — the view posts to `record_cost` via
 * `app.callServerTool(...)` (view-side only; vendor guide §6.7). This module
 * only stands up the pre-fill surface.
 */

// @ts-expect-error — wrangler's Text loader returns a string at runtime
// (vendor guide §6.4). `@gc-erp/cost-entry-form`'s Vite singlefile build
// produces `dist/cost-entry-form.html`; turbo.json wires `^build` onto
// `typecheck`/`test`/`dev`/`deploy` so the artifact exists before this
// resolves.
import COST_ENTRY_FORM_HTML from "@gc-erp/cost-entry-form/dist/cost-entry-form.html";
import type { DatabaseClient } from "@gc-erp/database";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpToolError } from "./_mcp-tool";
import {
  type CostEntryFormContext,
  CostEntryFormInput,
  resolveCostEntryFormContext,
} from "./cost_entry_form.resolver";

const TOOL_NAME = "cost_entry_form";
const RESOURCE_URI = "ui://cost-entry-form/view.html";

const DESCRIPTION =
  "Open the cost-entry form, pre-filled with whatever context (job, scope, commitment, activity, counterparty, amount, date, memo) is known. The human confirms and submits; the form then calls `record_cost` with the final values.";

export function formatContextSummary(ctx: CostEntryFormContext): string {
  const parts: string[] = [`job "${ctx.jobName}" (${ctx.jobId})`];
  if (ctx.scopeName !== undefined) parts.push(`scope "${ctx.scopeName}"`);
  if (ctx.commitmentLabel !== undefined)
    parts.push(`commitment "${ctx.commitmentLabel}"`);
  if (ctx.activityName !== undefined)
    parts.push(`activity "${ctx.activityName}"`);
  if (ctx.counterpartyName !== undefined)
    parts.push(`counterparty "${ctx.counterpartyName}"`);
  if (ctx.amount !== undefined)
    parts.push(`amount ${ctx.amount.cents} ${ctx.amount.currency}`);
  if (ctx.incurredOn !== undefined) parts.push(`incurredOn ${ctx.incurredOn}`);
  if (ctx.memo !== undefined) parts.push(`memo "${ctx.memo}"`);
  return `Cost-entry context resolved: ${parts.join(", ")}.`;
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

/* v8 ignore start -- workerd-only wiring; the resolver + pure adapters are
 * covered in cost_entry_form.test.ts and cost_entry_form.resolver.test.ts.
 * registerAppTool / registerAppResource only run inside the DO. */
export function registerCostEntryForm(
  server: McpServer,
  getDb: () => DatabaseClient,
): void {
  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: "Cost entry form",
      description: DESCRIPTION,
      inputSchema: CostEntryFormInput.shape,
      _meta: { ui: { resourceUri: RESOURCE_URI, prefersBorder: true } },
    },
    async (input) => {
      const result = await runResolver(getDb, input as CostEntryFormInput);
      if (result instanceof McpToolError) return toErrorResult(result);
      return {
        content: [{ type: "text", text: formatContextSummary(result) }],
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
          _meta: { ui: { csp: { resourceDomains: [] }, prefersBorder: true } },
        },
      ],
    }),
  );
}
/* v8 ignore stop */
