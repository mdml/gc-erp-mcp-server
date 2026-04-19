import { describe, expect, it } from "vitest";
import type { DeveloperSecret, TeamSecret } from "./secrets.config";
import {
  buildDevVarsBody,
  classifyDeveloperFetch,
  classifyTeamFetch,
  parseEnvOpLocal,
  planDeveloperFetch,
} from "./sync-secrets";

const teamSpec: TeamSecret = {
  name: "MCP_BEARER_TOKEN",
  opRef: "op://gc-erp/mcp-bearer/credential",
  targets: ["envrc", "dev-vars"],
};

const devSpec: DeveloperSecret = {
  name: "CS_ACCESS_TOKEN",
  description: "Switches the code-health gate to strict.",
  targets: ["envrc"],
};

describe("parseEnvOpLocal", () => {
  it("parses NAME=opRef pairs", () => {
    const parsed = parseEnvOpLocal(
      [
        "CS_ACCESS_TOKEN=op://Private/codescene/token",
        "GH_TOKEN=op://Private/github/token",
      ].join("\n"),
    );
    expect(parsed).toEqual({
      CS_ACCESS_TOKEN: "op://Private/codescene/token",
      GH_TOKEN: "op://Private/github/token",
    });
  });

  it("ignores blank lines and comments", () => {
    const parsed = parseEnvOpLocal(
      [
        "# header comment",
        "",
        "CS_ACCESS_TOKEN=op://Private/codescene/token",
        "  # indented comment",
        "",
      ].join("\n"),
    );
    expect(parsed).toEqual({ CS_ACCESS_TOKEN: "op://Private/codescene/token" });
  });

  it("keeps blank values (present but empty) distinct from missing keys", () => {
    const parsed = parseEnvOpLocal(
      ["CS_ACCESS_TOKEN=", "GH_TOKEN="].join("\n"),
    );
    expect(parsed).toEqual({ CS_ACCESS_TOKEN: "", GH_TOKEN: "" });
  });

  it("ignores malformed lines (no '=')", () => {
    const parsed = parseEnvOpLocal(
      ["not an assignment", "CS_ACCESS_TOKEN=op://ok"].join("\n"),
    );
    expect(parsed).toEqual({ CS_ACCESS_TOKEN: "op://ok" });
  });

  it("trims surrounding whitespace on key and value", () => {
    const parsed = parseEnvOpLocal("  CS_ACCESS_TOKEN  =  op://ok  ");
    expect(parsed).toEqual({ CS_ACCESS_TOKEN: "op://ok" });
  });
});

describe("planDeveloperFetch", () => {
  it("skips when .env.op.local is missing (opLocal = null)", () => {
    const plan = planDeveloperFetch(devSpec, null);
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") {
      expect(plan.reason).toContain(".env.op.local not found");
      expect(plan.reason).toContain(".env.op.local.example");
    }
  });

  it("skips when the secret is absent from the file", () => {
    const plan = planDeveloperFetch(devSpec, { OTHER_SECRET: "op://x" });
    expect(plan.kind).toBe("skip");
    if (plan.kind === "skip") {
      expect(plan.reason).toContain("CS_ACCESS_TOKEN");
    }
  });

  it("skips when the entry is present but blank", () => {
    const plan = planDeveloperFetch(devSpec, { CS_ACCESS_TOKEN: "" });
    expect(plan.kind).toBe("skip");
  });

  it("fetches when the entry is present with a non-empty ref", () => {
    const plan = planDeveloperFetch(devSpec, {
      CS_ACCESS_TOKEN: "op://Private/codescene/token",
    });
    expect(plan).toEqual({
      kind: "fetch",
      opRef: "op://Private/codescene/token",
    });
  });
});

describe("classifyTeamFetch", () => {
  it("returns ok with the value on success", () => {
    const verdict = classifyTeamFetch(teamSpec, { ok: true, value: "abc" });
    expect(verdict).toEqual({
      kind: "ok",
      name: "MCP_BEARER_TOKEN",
      value: "abc",
    });
  });

  it("treats op-read failure as fatal (includes ref and stderr)", () => {
    const verdict = classifyTeamFetch(teamSpec, {
      ok: false,
      stderr: "[ERROR] item not found",
    });
    expect(verdict.kind).toBe("fatal");
    if (verdict.kind === "fatal") {
      expect(verdict.reason).toContain(teamSpec.opRef);
      expect(verdict.reason).toContain("[ERROR] item not found");
    }
  });
});

describe("classifyDeveloperFetch", () => {
  it("returns ok with the value on success", () => {
    const verdict = classifyDeveloperFetch(
      devSpec,
      "op://Private/codescene/token",
      {
        ok: true,
        value: "xyz",
      },
    );
    expect(verdict).toEqual({
      kind: "ok",
      name: "CS_ACCESS_TOKEN",
      value: "xyz",
    });
  });

  it("degrades to skip (never fatal) when op read fails", () => {
    const verdict = classifyDeveloperFetch(
      devSpec,
      "op://Private/codescene/token",
      {
        ok: false,
        stderr: "[ERROR] expired credential",
      },
    );
    expect(verdict.kind).toBe("skip");
    if (verdict.kind === "skip") {
      expect(verdict.reason).toContain("op://Private/codescene/token");
      expect(verdict.reason).toContain("expired credential");
    }
  });
});

describe("buildDevVarsBody", () => {
  it("emits literals when no resolved secrets target dev-vars", () => {
    const { body, names } = buildDevVarsBody([], { MCP_BEARER_TOKEN: "dev" });
    expect(body).toBe("MCP_BEARER_TOKEN=dev\n");
    expect(names).toEqual(["MCP_BEARER_TOKEN"]);
  });

  it("includes resolved dev-vars secrets alongside literals", () => {
    const { body, names } = buildDevVarsBody(
      [{ name: "FOO", value: "bar", targets: ["dev-vars"] }],
      { MCP_BEARER_TOKEN: "dev" },
    );
    expect(names.sort()).toEqual(["FOO", "MCP_BEARER_TOKEN"]);
    expect(body).toContain("FOO=bar");
    expect(body).toContain("MCP_BEARER_TOKEN=dev");
  });

  it("ignores resolved secrets that don't target dev-vars", () => {
    const { names } = buildDevVarsBody(
      [{ name: "ENVRC_ONLY", value: "x", targets: ["envrc"] }],
      {},
    );
    expect(names).toEqual([]);
  });

  it("literals override resolved values of the same name (local stays local)", () => {
    const { body } = buildDevVarsBody(
      [
        {
          name: "MCP_BEARER_TOKEN",
          value: "real-prod-token-xyz",
          targets: ["dev-vars"],
        },
      ],
      { MCP_BEARER_TOKEN: "dev" },
    );
    expect(body).toBe("MCP_BEARER_TOKEN=dev\n");
    expect(body).not.toContain("real-prod-token-xyz");
  });

  it("emits a single trailing newline (wrangler dotenv parser quirk)", () => {
    const { body } = buildDevVarsBody([], { MCP_BEARER_TOKEN: "dev" });
    expect(body.endsWith("\n")).toBe(true);
    expect(body.endsWith("\n\n")).toBe(false);
  });
});
