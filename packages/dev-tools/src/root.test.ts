import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot } from "./root";

describe("findWorkspaceRoot", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "gc-erp-root-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("finds the package.json with 'workspaces' walking up from a nested dir", () => {
    writeFileSync(
      join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const nested = join(tmpRoot, "packages", "foo", "src");
    mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(tmpRoot);
  });

  it("ignores non-workspace package.json files while walking up", () => {
    const pkgDir = join(tmpRoot, "packages", "foo");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "foo" }),
    );
    writeFileSync(
      join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );

    expect(findWorkspaceRoot(pkgDir)).toBe(tmpRoot);
  });

  it("throws if no workspace package.json is reachable", () => {
    // tmpRoot has no package.json at all.
    expect(() => findWorkspaceRoot(tmpRoot)).toThrow(
      /could not locate workspace root/,
    );
  });

  it("tolerates malformed package.json while walking up", () => {
    const pkgDir = join(tmpRoot, "packages", "foo");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), "{ not json");
    writeFileSync(
      join(tmpRoot, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] }),
    );

    expect(findWorkspaceRoot(pkgDir)).toBe(tmpRoot);
  });
});
