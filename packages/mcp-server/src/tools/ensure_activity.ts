/**
 * ensure_activity — TOOLS.md §3.1.
 *
 * Idempotent-by-slug. Returns the existing Activity row if one already has
 * the given slug; otherwise inserts a fresh row and returns it. Caller-
 * supplied `name` / `defaultUnit` are ignored when the slug already exists
 * — mutating activity metadata is out of scope for this tool (a future
 * `update_activity` would take it on), which keeps `ensure_activity` usable
 * as a write-safe primitive during seeding or tool composition.
 */

import { Activity, activities, newActivityId } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { McpToolDef } from "./_mcp-tool";

export const EnsureActivityInput = z.object({
  slug: z.string(),
  name: z.string(),
  defaultUnit: z.string().optional(),
});

export const EnsureActivityOutput = z.object({ activity: Activity });

export const ensureActivity: McpToolDef<
  typeof EnsureActivityInput,
  typeof EnsureActivityOutput
> = {
  name: "ensure_activity",
  description:
    "Idempotent upsert-by-slug for the shared Activity library. If an Activity with the given slug exists, returns it unchanged (caller's name/defaultUnit are ignored). Otherwise creates it.",
  inputSchema: EnsureActivityInput,
  outputSchema: EnsureActivityOutput,
  handler: async ({ db, input }) => {
    const existing = await db
      .select()
      .from(activities)
      .where(eq(activities.slug, input.slug))
      .get();
    if (existing) {
      const activity = Activity.parse({
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        ...(existing.defaultUnit !== null
          ? { defaultUnit: existing.defaultUnit }
          : {}),
      });
      return { activity };
    }

    const id = newActivityId();
    await db
      .insert(activities)
      .values({
        id,
        name: input.name,
        slug: input.slug,
        defaultUnit: input.defaultUnit,
      })
      .run();

    const activity = Activity.parse({
      id,
      name: input.name,
      slug: input.slug,
      ...(input.defaultUnit !== undefined
        ? { defaultUnit: input.defaultUnit }
        : {}),
    });
    return { activity };
  },
};
