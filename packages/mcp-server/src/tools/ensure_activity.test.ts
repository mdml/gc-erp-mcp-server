import { activities } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { ensureActivity } from "./ensure_activity";

describe("ensure_activity", () => {
  it("creates a new Activity when the slug is unseen", async () => {
    const db = createTestDb();
    const { activity } = await ensureActivity.handler({
      db,
      input: { slug: "lumber_drop", name: "Lumber Drop" },
    });
    expect(activity.id.startsWith("act_")).toBe(true);
    expect(activity.slug).toBe("lumber_drop");
    expect(activity.name).toBe("Lumber Drop");
    expect(activity.defaultUnit).toBeUndefined();

    const row = await db
      .select()
      .from(activities)
      .where(eq(activities.slug, "lumber_drop"))
      .get();
    expect(row?.id).toBe(activity.id);
  });

  it("stores defaultUnit when provided", async () => {
    const db = createTestDb();
    const { activity } = await ensureActivity.handler({
      db,
      input: { slug: "frame", name: "Frame", defaultUnit: "lf" },
    });
    expect(activity.defaultUnit).toBe("lf");
  });

  it("returns the existing row on second call and does not mutate it", async () => {
    const db = createTestDb();
    const first = await ensureActivity.handler({
      db,
      input: { slug: "paint", name: "Paint", defaultUnit: "sqft" },
    });
    const second = await ensureActivity.handler({
      db,
      input: { slug: "paint", name: "Painting (redux)", defaultUnit: "m2" },
    });
    expect(second.activity).toEqual(first.activity);

    const all = await db
      .select()
      .from(activities)
      .where(eq(activities.slug, "paint"))
      .all();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Paint");
    expect(all[0]?.defaultUnit).toBe("sqft");
  });

  it("returned existing row omits defaultUnit when the stored value is null", async () => {
    const db = createTestDb();
    await ensureActivity.handler({
      db,
      input: { slug: "demo", name: "Demolition" },
    });
    const { activity } = await ensureActivity.handler({
      db,
      input: { slug: "demo", name: "Demolition" },
    });
    expect(activity.defaultUnit).toBeUndefined();
  });
});
