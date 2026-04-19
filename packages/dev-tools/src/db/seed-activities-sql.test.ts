import { describe, expect, it } from "vitest";
import { buildActivitySeedSql } from "./seed-activities-sql";

describe("buildActivitySeedSql", () => {
  it("emits one INSERT OR IGNORE per row, trailing newline", () => {
    const sql = buildActivitySeedSql([
      { id: "act_a", name: "Frame", slug: "frame", defaultUnit: "lf" },
      { id: "act_b", name: "Demolition", slug: "demo" },
    ]);
    expect(sql).toBe(
      [
        "INSERT OR IGNORE INTO activities (id, name, slug, default_unit) VALUES ('act_a', 'Frame', 'frame', 'lf');",
        "INSERT OR IGNORE INTO activities (id, name, slug, default_unit) VALUES ('act_b', 'Demolition', 'demo', NULL);",
        "",
      ].join("\n"),
    );
  });

  it("renders defaultUnit=undefined as the literal NULL", () => {
    const sql = buildActivitySeedSql([
      { id: "act_x", name: "Paint", slug: "paint" },
    ]);
    expect(sql).toContain(", NULL);");
    expect(sql).not.toContain("'NULL'");
  });

  it("escapes embedded single quotes by doubling them", () => {
    const sql = buildActivitySeedSql([
      { id: "act_q", name: "O'Brien", slug: "o-brien" },
    ]);
    expect(sql).toContain("'O''Brien'");
  });

  it("returns '\\n' for an empty input (no crash)", () => {
    expect(buildActivitySeedSql([])).toBe("\n");
  });
});
