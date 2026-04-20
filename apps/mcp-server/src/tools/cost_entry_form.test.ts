import { type JobId, jobs, type ProjectId, projects } from "@gc-erp/database";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import {
  formatFallbackText,
  runResolver,
  toErrorResult,
} from "./cost_entry_form";
import type { CostEntryFormContext } from "./cost_entry_form.resolver";

// Unit-test the pure adapters. The registration function
// (`registerCostEntryForm`) is covered by an explicit `v8 ignore` block —
// it's workerd-only wiring that calls into McpAgent internals.

// ---------------------------------------------------------------------------
// formatFallbackText — branches on whether each paired field is present.
// ---------------------------------------------------------------------------

describe("formatFallbackText", () => {
  it("renders only the job header when no other fields are present", () => {
    const ctx: CostEntryFormContext = {
      jobId: "job_t" as JobId,
      jobName: "Kitchen",
    };
    const text = formatFallbackText(ctx);
    expect(text).toContain('Cost-entry context resolved for job "Kitchen"');
    expect(text).not.toContain("scope:");
    expect(text).not.toContain("commitment:");
    expect(text).not.toContain("activity:");
    expect(text).not.toContain("counterparty:");
    expect(text).not.toContain("amount:");
    expect(text).not.toContain("incurredOn:");
    expect(text).not.toContain("memo:");
    expect(text).toContain("Call `record_cost`");
  });

  it("renders every field when the context is fully resolved", () => {
    const ctx: CostEntryFormContext = {
      jobId: "job_t" as JobId,
      jobName: "Kitchen",
      scopeId: "scope_t" as CostEntryFormContext["scopeId"],
      scopeName: "Framing",
      commitmentId: "cm_t" as CostEntryFormContext["commitmentId"],
      commitmentLabel: "Rogelio's Framing LLC",
      activityId: "act_t" as CostEntryFormContext["activityId"],
      activityName: "Frame",
      counterpartyId: "party_t" as CostEntryFormContext["counterpartyId"],
      counterpartyName: "Client",
      amount: { cents: 12_345, currency: "USD" },
      incurredOn: "2026-05-04",
      memo: "deposit",
    };
    const text = formatFallbackText(ctx);
    expect(text).toContain("scope: Framing (scope_t)");
    expect(text).toContain("commitment: Rogelio's Framing LLC (cm_t)");
    expect(text).toContain("activity: Frame (act_t)");
    expect(text).toContain("counterparty: Client (party_t)");
    expect(text).toContain("amount: 12345 cents USD");
    expect(text).toContain("incurredOn: 2026-05-04");
    expect(text).toContain("memo: deposit");
  });
});

// ---------------------------------------------------------------------------
// toErrorResult — wraps McpToolError into the MCP isError shape.
// ---------------------------------------------------------------------------

describe("toErrorResult", () => {
  it("returns isError:true with a text content block carrying the structured payload", () => {
    const err = new McpToolError("not_found", "missing thing", {
      thingId: "x",
    });
    const result: CallToolResult = toErrorResult(err);
    expect(result.isError).toBe(true);
    const block = result.content[0];
    expect(block?.type).toBe("text");
    const payload = JSON.parse((block as { text: string }).text);
    expect(payload).toEqual({
      code: "not_found",
      message: "missing thing",
      details: { thingId: "x" },
    });
  });
});

// ---------------------------------------------------------------------------
// runResolver — catches McpToolError; re-throws anything else.
// ---------------------------------------------------------------------------

describe("runResolver", () => {
  it("returns the resolved context on the happy path", async () => {
    const db = createTestDb();
    await db
      .insert(projects)
      .values({ id: "proj_r" as ProjectId, name: "P", slug: "p" })
      .run();
    await db
      .insert(jobs)
      .values({
        id: "job_r" as JobId,
        projectId: "proj_r" as ProjectId,
        name: "Kitchen",
        slug: "k",
      })
      .run();
    const result = await runResolver(() => db, { jobId: "job_r" as JobId });
    expect(result).toEqual({ jobId: "job_r", jobName: "Kitchen" });
  });

  it("returns an McpToolError value (does not throw) when the resolver raises one", async () => {
    const db = createTestDb();
    const result = await runResolver(() => db, {
      jobId: "job_missing" as JobId,
    });
    expect(result).toBeInstanceOf(McpToolError);
    expect((result as McpToolError).code).toBe("not_found");
  });

  it("re-throws non-McpToolError exceptions so the MCP SDK surfaces a protocol error", async () => {
    const brokenDb = {
      select: () => {
        throw new TypeError("db broken");
      },
    } as unknown as ReturnType<typeof createTestDb>;
    await expect(
      runResolver(() => brokenDb, { jobId: "job_x" as JobId }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
