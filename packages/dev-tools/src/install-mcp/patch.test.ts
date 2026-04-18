import { describe, expect, it } from "vitest";
import {
  addLocalEntry,
  backupPath,
  backupTimestamp,
  LOCAL_ENTRY,
  LOCAL_ENTRY_NAME,
  PROD_BEARER_PLACEHOLDER,
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
  it("uses the literal bearer placeholder (never $MCP_BEARER_TOKEN)", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain(PROD_BEARER_PLACEHOLDER);
    expect(out).toContain("gc-erp-prod");
    expect(out).toContain("https://gc.leiserson.me/mcp");
    // Guardrail: no env-var interpolation, no shell-substitution syntax.
    expect(out).not.toContain("$");
  });

  it("leads with the Claude.ai connector flow (mobile + web)", () => {
    const out = renderProdConnectionGuide();
    const claudeAiIdx = out.indexOf("Claude.ai");
    const desktopIdx = out.indexOf("Claude Desktop");
    expect(claudeAiIdx).toBeGreaterThan(-1);
    expect(desktopIdx).toBeGreaterThan(-1);
    // Mobile/web is the primary prod use case — must appear first.
    expect(claudeAiIdx).toBeLessThan(desktopIdx);
  });

  it("includes the in-app connector path for both iOS/Android and web", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain("iOS / Android");
    expect(out).toContain("Settings");
    expect(out).toContain("Connectors");
  });

  it("still includes the Desktop JSON block as Option 2", () => {
    const out = renderProdConnectionGuide();
    expect(out).toContain('"mcpServers"');
    expect(out).toContain('"type": "http"');
    expect(out).toContain(`Bearer ${PROD_BEARER_PLACEHOLDER}`);
  });
});
