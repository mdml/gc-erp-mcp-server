import { describe, expect, it } from "vitest";
import { parseArgs, resolveConfig, TARGET_URLS } from "./args";

describe("parseArgs", () => {
  it("defaults target=local, yes=false when no flags", () => {
    expect(parseArgs(["kitchen"])).toEqual({
      name: "kitchen",
      reset: false,
      list: false,
      help: false,
      target: "local",
      yes: false,
    });
  });

  it("accepts --target local and --target prod in space-separated form", () => {
    expect(parseArgs(["kitchen", "--target", "prod"]).target).toBe("prod");
    expect(parseArgs(["kitchen", "--target", "local"]).target).toBe("local");
  });

  it("accepts --target=prod equals form", () => {
    expect(parseArgs(["kitchen", "--target=prod"]).target).toBe("prod");
  });

  it("throws on invalid --target value", () => {
    expect(() => parseArgs(["kitchen", "--target", "dev"])).toThrow(
      /must be "local" or "prod"/,
    );
    expect(() => parseArgs(["kitchen", "--target"])).toThrow(/<missing>/);
    expect(() => parseArgs(["kitchen", "--target=dev"])).toThrow(
      /must be "local" or "prod"/,
    );
  });

  it("sets yes=true for both --yes and -y", () => {
    expect(parseArgs(["kitchen", "--yes"]).yes).toBe(true);
    expect(parseArgs(["kitchen", "-y"]).yes).toBe(true);
  });

  it("captures --reset / --list / --help independently", () => {
    expect(parseArgs(["kitchen", "--reset"]).reset).toBe(true);
    expect(parseArgs(["--list"]).list).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("does not step on the positional name when flags appear first", () => {
    expect(parseArgs(["--reset", "kitchen", "--target", "prod"])).toMatchObject(
      { name: "kitchen", reset: true, target: "prod" },
    );
  });
});

describe("resolveConfig", () => {
  const base = {
    name: "kitchen",
    reset: false,
    list: false,
    help: false,
    target: "local" as const,
    yes: false,
  };

  it("resolves to the local URL when target=local and no MCP_SERVER_URL override", () => {
    const res = resolveConfig(base, { MCP_BEARER_TOKEN: "dev" }, ["kitchen"]);
    expect(res).toEqual({
      ok: true,
      config: {
        name: "kitchen",
        target: "local",
        url: TARGET_URLS.local,
        bearer: "dev",
        reset: false,
        yes: false,
      },
    });
  });

  it("resolves to the prod URL when target=prod", () => {
    const res = resolveConfig(
      { ...base, target: "prod" },
      { MCP_BEARER_TOKEN: "real-secret" },
      ["kitchen"],
    );
    expect(res).toMatchObject({ ok: true, config: { url: TARGET_URLS.prod } });
  });

  it("honors MCP_SERVER_URL override", () => {
    const res = resolveConfig(
      base,
      { MCP_BEARER_TOKEN: "dev", MCP_SERVER_URL: "http://localhost:9000/mcp" },
      ["kitchen"],
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.config.url).toBe("http://localhost:9000/mcp");
  });

  it("fails with code 2 when MCP_BEARER_TOKEN is missing (local)", () => {
    const res = resolveConfig(base, {}, ["kitchen"]);
    expect(res).toEqual({
      ok: false,
      code: 2,
      message: expect.stringContaining("direnv allow"),
    });
  });

  it("gives a prod-specific error when MCP_BEARER_TOKEN is missing with --target prod", () => {
    const res = resolveConfig({ ...base, target: "prod" }, {}, ["kitchen"]);
    expect(res).toMatchObject({
      ok: false,
      code: 2,
      message: expect.stringContaining("--target prod requires"),
    });
  });

  it("fails with code 2 on unknown scenario name", () => {
    const res = resolveConfig(
      { ...base, name: "bogus" },
      { MCP_BEARER_TOKEN: "dev" },
      ["kitchen"],
    );
    expect(res).toMatchObject({ ok: false, code: 2, message: /unknown/ });
  });

  it("fails with code 2 when no scenario name was provided", () => {
    const res = resolveConfig(
      { ...base, name: null },
      { MCP_BEARER_TOKEN: "dev" },
      ["kitchen"],
    );
    expect(res).toMatchObject({ ok: false, code: 2, message: /required/ });
  });
});
