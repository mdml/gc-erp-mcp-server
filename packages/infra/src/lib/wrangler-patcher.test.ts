import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { patchWranglerJsonc } from "./wrangler-patcher";

function makeTmp(content: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "wrangler-patcher-"));
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, content, "utf8");
  return { path, cleanup: () => rmSync(dir, { recursive: true }) };
}

describe("patchWranglerJsonc", () => {
  it("adds a new top-level key", () => {
    const { path, cleanup } = makeTmp(`{ "name": "test-worker" }`);
    try {
      patchWranglerJsonc([{ path: ["version"], value: 42 }], path);
      const result = JSON.parse(readFileSync(path, "utf8"));
      expect(result).toMatchObject({ name: "test-worker", version: 42 });
    } finally {
      cleanup();
    }
  });

  it("preserves comments around modified content", () => {
    const { path, cleanup } = makeTmp(
      `{\n  // this comment must survive\n  "name": "test"\n}`,
    );
    try {
      patchWranglerJsonc(
        [{ path: ["d1_databases"], value: [{ binding: "DB" }] }],
        path,
      );
      const result = readFileSync(path, "utf8");
      expect(result).toContain("// this comment must survive");
      expect(result).toContain('"d1_databases"');
    } finally {
      cleanup();
    }
  });

  it("applies multiple patches in sequence", () => {
    const { path, cleanup } = makeTmp(`{ "name": "test" }`);
    try {
      patchWranglerJsonc(
        [
          { path: ["foo"], value: 1 },
          { path: ["bar"], value: 2 },
        ],
        path,
      );
      const result = JSON.parse(readFileSync(path, "utf8"));
      expect(result.foo).toBe(1);
      expect(result.bar).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("overwrites an existing key", () => {
    const { path, cleanup } = makeTmp(`{ "name": "old" }`);
    try {
      patchWranglerJsonc([{ path: ["name"], value: "new" }], path);
      const result = JSON.parse(readFileSync(path, "utf8"));
      expect(result.name).toBe("new");
    } finally {
      cleanup();
    }
  });
});
