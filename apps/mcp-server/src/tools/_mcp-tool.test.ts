import type { DatabaseClient } from "@gc-erp/database";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  buildToolCallback,
  type McpToolDef,
  McpToolError,
  registerToolOn,
} from "./_mcp-tool";

const fakeDb = {} as DatabaseClient;

const inputSchema = z.object({ n: z.number() });
const outputSchema = z.object({ doubled: z.number() });

const doubler: McpToolDef<typeof inputSchema, typeof outputSchema> = {
  name: "doubler",
  description: "doubles a number",
  inputSchema,
  outputSchema,
  handler: async ({ input }) => ({ doubled: input.n * 2 }),
};

describe("McpToolError", () => {
  it("carries code, message, and details", () => {
    const err = new McpToolError("not_found", "missing project", {
      projectId: "proj_x",
    });
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("missing project");
    expect(err.details).toEqual({ projectId: "proj_x" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("McpToolError");
  });

  it("leaves details undefined when not supplied", () => {
    const err = new McpToolError("invariant_violation", "bad");
    expect(err.details).toBeUndefined();
  });
});

describe("buildToolCallback", () => {
  it("returns content + structuredContent on success", async () => {
    const cb = buildToolCallback(doubler, () => fakeDb);
    const res = await cb({ n: 3 });
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ doubled: 6 });
    const text = res.content?.[0];
    expect(text?.type).toBe("text");
    expect(text && "text" in text ? JSON.parse(text.text) : null).toEqual({
      doubled: 6,
    });
  });

  it("passes the db returned by getDb into the handler", async () => {
    const getDb = vi.fn(() => fakeDb);
    let seenDb: unknown = null;
    const spy: McpToolDef<typeof inputSchema, typeof outputSchema> = {
      ...doubler,
      handler: async ({ db, input }) => {
        seenDb = db;
        return { doubled: input.n };
      },
    };
    await buildToolCallback(spy, getDb)({ n: 1 });
    expect(getDb).toHaveBeenCalledOnce();
    expect(seenDb).toBe(fakeDb);
  });

  it("maps McpToolError to isError=true payload", async () => {
    const failing: McpToolDef<typeof inputSchema, typeof outputSchema> = {
      ...doubler,
      handler: async () => {
        throw new McpToolError("not_found", "nope", { x: 1 });
      },
    };
    const res = await buildToolCallback(failing, () => fakeDb)({ n: 1 });
    expect(res.isError).toBe(true);
    const text = res.content?.[0];
    const body =
      text && "text" in text ? (JSON.parse(text.text) as unknown) : null;
    expect(body).toEqual({
      code: "not_found",
      message: "nope",
      details: { x: 1 },
    });
  });

  it("rethrows non-McpToolError errors (unexpected failures surface)", async () => {
    const bug: McpToolDef<typeof inputSchema, typeof outputSchema> = {
      ...doubler,
      handler: async () => {
        throw new Error("boom");
      },
    };
    await expect(
      buildToolCallback(bug, () => fakeDb)({ n: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("registerToolOn", () => {
  it("forwards name, description, and schemas to server.registerTool", () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as McpServer;
    registerToolOn(server, doubler, () => fakeDb);
    expect(registerTool).toHaveBeenCalledOnce();
    const [name, config, cb] = registerTool.mock.calls[0] as [
      string,
      {
        description: string;
        inputSchema: typeof inputSchema;
        outputSchema: typeof outputSchema;
      },
      unknown,
    ];
    expect(name).toBe("doubler");
    expect(config.description).toBe("doubles a number");
    expect(config.inputSchema).toBe(inputSchema);
    expect(config.outputSchema).toBe(outputSchema);
    expect(typeof cb).toBe("function");
  });
});
