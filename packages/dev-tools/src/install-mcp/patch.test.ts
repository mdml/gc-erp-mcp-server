import { describe, expect, it } from "vitest";
import {
  addLocalEntry,
  backupPath,
  backupTimestamp,
  LOCAL_ENTRY,
  LOCAL_ENTRY_NAME,
  removeLocalEntry,
  renderProdConnectionGuide,
  serializeConfig,
} from "./patch";

describe("addLocalEntry", () => {
  it("inserts gc-erp-local alongside existing servers", () => {
    const existing = {
      mcpServers: {
        "some-other": { type: "http", url: "https://example.com/mcp" },
      },
    };
    const out = addLocalEntry(existing);
    expect(out.mcpServers).toEqual({
      "some-other": { type: "http", url: "https://example.com/mcp" },
      [LOCAL_ENTRY_NAME]: LOCAL_ENTRY,
    });
  });

  it("creates mcpServers on an empty config", () => {
    const out = addLocalEntry({});
    expect(out.mcpServers).toEqual({ [LOCAL_ENTRY_NAME]: LOCAL_ENTRY });
  });

  it("preserves unrelated top-level keys untouched", () => {
    const out = addLocalEntry({ someOtherKey: "untouched" });
    expect(out.someOtherKey).toBe("untouched");
  });

  it("overwrites any existing gc-erp-local entry", () => {
    const out = addLocalEntry({
      mcpServers: { [LOCAL_ENTRY_NAME]: { type: "stale" } },
    });
    expect(out.mcpServers?.[LOCAL_ENTRY_NAME]).toEqual(LOCAL_ENTRY);
  });

  it("does not mutate the input", () => {
    const input = { mcpServers: { "some-other": {} } };
    const snapshot = JSON.parse(JSON.stringify(input));
    addLocalEntry(input);
    expect(input).toEqual(snapshot);
  });
});

describe("removeLocalEntry", () => {
  it("removes only the gc-erp-local key", () => {
    const out = removeLocalEntry({
      mcpServers: {
        "some-other": { type: "http" },
        [LOCAL_ENTRY_NAME]: LOCAL_ENTRY,
      },
    });
    expect(out.mcpServers).toEqual({ "some-other": { type: "http" } });
  });

  it("is a no-op when gc-erp-local is absent", () => {
    const out = removeLocalEntry({ mcpServers: { "some-other": {} } });
    expect(out.mcpServers).toEqual({ "some-other": {} });
  });

  it("is a no-op on a config with no mcpServers", () => {
    const out = removeLocalEntry({ someOtherKey: "x" });
    expect(out.someOtherKey).toBe("x");
    expect(out.mcpServers).toEqual({});
  });
});

describe("backupTimestamp / backupPath", () => {
  it("formats UTC as YYYYMMDD-HHMMSS", () => {
    expect(backupTimestamp(new Date("2026-04-18T15:30:45Z"))).toBe(
      "20260418-153045",
    );
  });

  it("zero-pads single-digit month/day/time components", () => {
    expect(backupTimestamp(new Date("2026-01-02T03:04:05Z"))).toBe(
      "20260102-030405",
    );
  });

  it("produces <original>.<ts>.bak", () => {
    expect(
      backupPath(
        "/tmp/claude_desktop_config.json",
        new Date("2026-04-18T15:30:45Z"),
      ),
    ).toBe("/tmp/claude_desktop_config.json.20260418-153045.bak");
  });
});

describe("serializeConfig", () => {
  it("2-space indent with trailing newline", () => {
    const text = serializeConfig({ mcpServers: { foo: { type: "http" } } });
    expect(text).toBe(
      [
        "{",
        '  "mcpServers": {',
        '    "foo": {',
        '      "type": "http"',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });
});

describe("renderProdConnectionGuide", () => {
  it("emits an OAuth-native Desktop block — no bearer, no AUTH_HEADER, no --header", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain("gc-erp-prod");
    expect(out).toContain("https://gc.leiserson.me/mcp");
    // No bearer interpolation anywhere — OAuth is handled by mcp-remote
    // natively, so the prod entry carries no token at all.
    expect(out).not.toContain("Bearer");
    expect(out).not.toContain("AUTH_HEADER");
    expect(out).not.toContain("--header");
    expect(out).not.toContain("MCP_BEARER_TOKEN");
  });

  it("includes the Desktop JSON block in mcp-remote bridge shape with absolute npx", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain('"mcpServers"');
    // Absolute path + pinned PATH — Desktop's launch-services PATH doesn't
    // include Homebrew/nvm by default (same caveat as install:mcp:local).
    expect(out).toContain('"command": "/opt/homebrew/bin/npx"');
    expect(out).toContain('"mcp-remote"');
    expect(out).toContain("/opt/homebrew/bin:/usr/bin:/bin");
    // Negative: the old native-HTTP shape that Desktop rejects as invalid
    expect(out).not.toContain('"type": "http"');
  });

  it("documents the Clerk hosted-consent flow for Desktop", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain("Clerk-hosted consent page");
    expect(out).toMatch(/approve the scopes/i);
  });

  it("includes a claude.ai Connectors section (now supported via OAuth)", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain("Claude.ai");
    expect(out).toMatch(/Connectors|connector/);
    // No longer blocked — remove the old "not yet supported" framing.
    expect(out).not.toContain("not yet supported");
  });
});
