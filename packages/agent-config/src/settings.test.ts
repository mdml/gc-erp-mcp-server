import { describe, expect, it } from "vitest";
import { bashAllow, mcpAllow } from "./policy/allow";
import { bashDeny } from "./policy/deny";
import { enabledMcpServers } from "./policy/mcp";
import {
  assertNoPolicyConflicts,
  composeSettings,
  serializeSettings,
} from "./settings";

describe("composeSettings", () => {
  it("produces a settings object with permissions + enabledMcpjsonServers", () => {
    const s = composeSettings();
    expect(Object.keys(s).sort()).toEqual([
      "enabledMcpjsonServers",
      "permissions",
    ]);
    expect(Object.keys(s.permissions).sort()).toEqual(["allow", "deny"]);
  });

  it("includes every bash and mcp allow pattern", () => {
    const s = composeSettings();
    for (const p of [...bashAllow, ...mcpAllow]) {
      expect(s.permissions.allow).toContain(p);
    }
  });

  it("includes every bash deny pattern", () => {
    const s = composeSettings();
    for (const p of bashDeny) {
      expect(s.permissions.deny).toContain(p);
    }
  });

  it("preserves enabledMcpjsonServers order as declared", () => {
    const s = composeSettings();
    expect(s.permissions.deny).not.toContain(""); // sanity
    expect(s.enabledMcpjsonServers).toEqual([...enabledMcpServers]);
  });

  it("sorts allow and deny lists alphabetically for stable diffs", () => {
    const s = composeSettings();
    const sortedAllow = [...s.permissions.allow].sort((a, b) =>
      a.localeCompare(b),
    );
    const sortedDeny = [...s.permissions.deny].sort((a, b) =>
      a.localeCompare(b),
    );
    expect(s.permissions.allow).toEqual(sortedAllow);
    expect(s.permissions.deny).toEqual(sortedDeny);
  });

  it("produces a deny list that covers force-push variants", () => {
    const s = composeSettings();
    expect(s.permissions.deny).toContain("Bash(git push --force*)");
    expect(s.permissions.deny).toContain("Bash(git push -f*)");
    expect(s.permissions.deny).toContain("Bash(git push --force-with-lease*)");
  });

  it("allows feature-branch pushes but not bare `git push`", () => {
    const s = composeSettings();
    expect(s.permissions.allow).toContain("Bash(git push origin slice/*)");
    expect(s.permissions.allow).toContain("Bash(git push origin feat/*)");
    expect(s.permissions.allow).not.toContain("Bash(git push)");
    expect(s.permissions.allow).not.toContain("Bash(git push *)");
  });

  it("denies bun-run surfaces for production ops", () => {
    const s = composeSettings();
    expect(s.permissions.allow).toContain("Bash(bun run *)");
    expect(s.permissions.deny).toContain("Bash(bun run deploy*)");
    expect(s.permissions.deny).toContain("Bash(bun run infra:apply*)");
    expect(s.permissions.deny).toContain("Bash(bun run infra:teardown*)");
  });

  it("denies direct op/age usage", () => {
    const s = composeSettings();
    expect(s.permissions.deny).toContain("Bash(op read*)");
    expect(s.permissions.deny).toContain("Bash(age -d*)");
  });

  it("denies secret-file reads", () => {
    const s = composeSettings();
    expect(s.permissions.deny).toContain("Bash(cat .envrc.enc*)");
    expect(s.permissions.deny).toContain("Bash(cat .dev.vars*)");
    expect(s.permissions.deny).toContain("Bash(printenv*)");
  });

  it("dedupes pattern lists even if policy accidentally repeats one", () => {
    // Exercising the sortedUnique guard via the composer itself would require
    // a real duplicate in the policy files; instead confirm no dupes via set
    // size equality.
    const s = composeSettings();
    expect(new Set(s.permissions.allow).size).toBe(s.permissions.allow.length);
    expect(new Set(s.permissions.deny).size).toBe(s.permissions.deny.length);
  });
});

describe("assertNoPolicyConflicts", () => {
  it("accepts disjoint allow/deny lists", () => {
    expect(() =>
      assertNoPolicyConflicts(["Bash(ls *)"], ["Bash(rm -rf*)"]),
    ).not.toThrow();
  });

  it("rejects duplicate entries within allow", () => {
    expect(() =>
      assertNoPolicyConflicts(["Bash(ls *)", "Bash(ls *)"], []),
    ).toThrow(/duplicate pattern in allow/);
  });

  it("rejects duplicate entries within deny", () => {
    expect(() =>
      assertNoPolicyConflicts([], ["Bash(rm -rf*)", "Bash(rm -rf*)"]),
    ).toThrow(/duplicate pattern in deny/);
  });

  it("rejects a pattern that appears in both allow and deny", () => {
    expect(() =>
      assertNoPolicyConflicts(["Bash(rm -rf*)"], ["Bash(rm -rf*)"]),
    ).toThrow(/appears in both allow and deny/);
  });
});

describe("serializeSettings", () => {
  it("pretty-prints with 2-space indent and a trailing newline", () => {
    const text = serializeSettings({
      permissions: { allow: ["a"], deny: ["b"] },
      enabledMcpjsonServers: ["x"],
    });
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('    "allow": [\n      "a"\n    ]');
  });

  it("round-trips through JSON.parse", () => {
    const s = composeSettings();
    const text = serializeSettings(s);
    expect(JSON.parse(text)).toEqual(s);
  });
});
