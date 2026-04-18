import { describe, expect, it } from "vitest";
import {
  detectDestructiveKeywords,
  isDestructiveSql,
  parseYesFlag,
  planAndConfirm,
  renderPlan,
} from "./plan-confirm";

describe("renderPlan", () => {
  it("renders title, 'This will:', and bullet-prefixed actions", () => {
    const out = renderPlan({
      title: "db:reset:local",
      actions: ["truncate 12 tables", "re-apply 3 migrations"],
    });
    expect(out).toBe(
      [
        "db:reset:local",
        "",
        "This will:",
        "  • truncate 12 tables",
        "  • re-apply 3 migrations",
        "",
      ].join("\n"),
    );
  });

  it("handles zero actions without breaking (empty bullet list)", () => {
    const out = renderPlan({ title: "foo", actions: [] });
    expect(out).toBe(["foo", "", "This will:", ""].join("\n"));
  });
});

describe("parseYesFlag", () => {
  it("returns true when --yes is present", () => {
    expect(parseYesFlag(["--yes"])).toBe(true);
    expect(parseYesFlag(["foo", "--yes", "bar"])).toBe(true);
  });

  it("returns true when -y short flag is present", () => {
    expect(parseYesFlag(["-y"])).toBe(true);
  });

  it("returns false when neither flag is present", () => {
    expect(parseYesFlag([])).toBe(false);
    expect(parseYesFlag(["--target", "prod"])).toBe(false);
  });

  it("does not match flags that embed 'yes' as a substring", () => {
    // `--dry-run` and friends shouldn't falsely trigger. Important for
    // scenario runner where an unrelated long-flag could end in 'y'.
    expect(parseYesFlag(["--yesteryear"])).toBe(false);
    expect(parseYesFlag(["--say"])).toBe(false);
  });
});

describe("detectDestructiveKeywords", () => {
  it("finds DELETE / UPDATE / DROP / TRUNCATE / ALTER case-insensitively", () => {
    expect(detectDestructiveKeywords("DELETE FROM jobs")).toEqual(["DELETE"]);
    expect(detectDestructiveKeywords("update jobs set x = 1")).toEqual([
      "UPDATE",
    ]);
    expect(detectDestructiveKeywords("DROP TABLE foo")).toEqual(["DROP"]);
    expect(detectDestructiveKeywords("truncate activities")).toEqual([
      "TRUNCATE",
    ]);
    expect(detectDestructiveKeywords("ALTER TABLE jobs ADD x")).toEqual([
      "ALTER",
    ]);
  });

  it("reports multiple hits when a query mixes destructive ops", () => {
    expect(
      detectDestructiveKeywords(
        "BEGIN; DELETE FROM a; UPDATE b SET x=1; COMMIT",
      ),
    ).toEqual(["UPDATE", "DELETE"]);
  });

  it("ignores destructive words embedded in identifiers", () => {
    // `updated_at` column, `dropped_flag` alias, `alterations` table, etc.
    expect(detectDestructiveKeywords("SELECT updated_at FROM jobs")).toEqual(
      [],
    );
    expect(
      detectDestructiveKeywords("SELECT * FROM alterations WHERE dropped = 0"),
    ).toEqual([]);
  });

  it("returns [] for plain SELECT queries", () => {
    expect(
      detectDestructiveKeywords("SELECT count(*) FROM activities"),
    ).toEqual([]);
  });
});

describe("isDestructiveSql", () => {
  it("reflects detectDestructiveKeywords presence", () => {
    expect(isDestructiveSql("DELETE FROM jobs")).toBe(true);
    expect(isDestructiveSql("SELECT count(*) FROM jobs")).toBe(false);
  });
});

describe("planAndConfirm --yes branch", () => {
  function captureStream(): {
    stream: NodeJS.WritableStream;
    written: () => string;
  } {
    let buf = "";
    const stream = {
      write: (chunk: string | Uint8Array): boolean => {
        buf +=
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      },
    } as unknown as NodeJS.WritableStream;
    return { stream, written: () => buf };
  }

  it("prints the plan and returns true when yes=true (no prompt)", async () => {
    const { stream, written } = captureStream();
    const ok = await planAndConfirm({
      plan: { title: "x", actions: ["do y", "then z"] },
      yes: true,
      stream,
    });
    expect(ok).toBe(true);
    const out = written();
    expect(out).toContain("x");
    expect(out).toContain("This will:");
    expect(out).toContain("  • do y");
    expect(out).toContain("--yes: skipping confirmation");
  });
});
