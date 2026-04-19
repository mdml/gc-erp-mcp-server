import { describe, expect, it } from "vitest";
import {
  buildLocalEntry,
  type DesktopConfig,
  LOCAL_BEARER,
  LOCAL_MCP_URL,
  patchConfig,
  removeServer,
  SERVER_NAME,
} from "./install-mcp";

describe("buildLocalEntry", () => {
  it("pins command to the given npx path", () => {
    const entry = buildLocalEntry("/opt/homebrew/bin/npx");
    expect(entry.command).toBe("/opt/homebrew/bin/npx");
  });

  it("invokes mcp-remote against the local Worker URL", () => {
    const entry = buildLocalEntry("/opt/homebrew/bin/npx");
    expect(entry.args).toEqual([
      "-y",
      "mcp-remote",
      LOCAL_MCP_URL,
      "--header",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal string — mcp-remote performs the env-var substitution at runtime.
      "Authorization:${AUTH_HEADER}",
    ]);
  });

  it("passes the bearer token via env, not inline in --header (mcp-remote argv quirk)", () => {
    const entry = buildLocalEntry("/opt/homebrew/bin/npx");
    expect(entry.env).toEqual({ AUTH_HEADER: LOCAL_BEARER });
  });
});

describe("patchConfig", () => {
  it("inserts the server when mcpServers is missing", () => {
    const result = patchConfig({}, SERVER_NAME, buildLocalEntry("/x/npx"));
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers?.[SERVER_NAME]?.command).toBe("/x/npx");
  });

  it("preserves other servers when adding the gc-erp-local entry", () => {
    const existing: DesktopConfig = {
      mcpServers: {
        filesystem: { command: "npx", args: ["-y", "@m/server-filesystem"] },
      },
    };
    const result = patchConfig(
      existing,
      SERVER_NAME,
      buildLocalEntry("/x/npx"),
    );
    expect(result.mcpServers?.filesystem).toEqual(
      existing.mcpServers?.filesystem,
    );
    expect(result.mcpServers?.[SERVER_NAME]).toBeDefined();
  });

  it("preserves top-level non-mcpServers keys (e.g. preferences)", () => {
    const existing: DesktopConfig = {
      preferences: { sidebarMode: "task" },
    };
    const result = patchConfig(
      existing,
      SERVER_NAME,
      buildLocalEntry("/x/npx"),
    );
    expect(result.preferences).toEqual({ sidebarMode: "task" });
  });

  it("replaces an existing entry of the same name", () => {
    const existing: DesktopConfig = {
      mcpServers: {
        [SERVER_NAME]: { command: "old-npx", args: [] },
      },
    };
    const result = patchConfig(
      existing,
      SERVER_NAME,
      buildLocalEntry("/new/npx"),
    );
    expect(result.mcpServers?.[SERVER_NAME]?.command).toBe("/new/npx");
  });

  it("does not mutate the input", () => {
    const existing: DesktopConfig = { mcpServers: {} };
    patchConfig(existing, SERVER_NAME, buildLocalEntry("/x/npx"));
    expect(existing.mcpServers).toEqual({});
  });
});

describe("removeServer", () => {
  it("removes the named entry, preserving siblings", () => {
    const existing: DesktopConfig = {
      mcpServers: {
        filesystem: { command: "npx", args: [] },
        [SERVER_NAME]: { command: "npx", args: [] },
      },
    };
    const result = removeServer(existing, SERVER_NAME);
    expect(result.mcpServers).toEqual({
      filesystem: { command: "npx", args: [] },
    });
  });

  it("is idempotent when the entry is missing", () => {
    const existing: DesktopConfig = {
      mcpServers: { filesystem: { command: "npx", args: [] } },
    };
    const result = removeServer(existing, SERVER_NAME);
    expect(result).toEqual(existing);
  });

  it("is idempotent when mcpServers itself is missing", () => {
    const result = removeServer({}, SERVER_NAME);
    expect(result).toEqual({});
  });

  it("preserves top-level non-mcpServers keys", () => {
    const existing: DesktopConfig = {
      mcpServers: { [SERVER_NAME]: { command: "npx", args: [] } },
      preferences: { sidebarMode: "task" },
    };
    const result = removeServer(existing, SERVER_NAME);
    expect(result.preferences).toEqual({ sidebarMode: "task" });
  });
});
