/**
 * The kitchen scenario — TOOLS.md §6, driven over the wire against
 * `bun run dev`. Per-day async functions; the whole file is Layer 2 of
 * ADR 0004's acceptance-testing strategy.
 *
 * Invariant: each day is re-runnable given a freshly-reset local D1.
 * State handed between days lives on `ctx.state` so later days can
 * reference the ids minted earlier. No module-level state.
 *
 * Days 3 / 10 / 14 / 18 / 60 land as the corresponding tools do
 * (`apply_patch`, `issue_ntp`, `record_cost`, `record_direct_cost`).
 */

import { assertEqual, assertTrue } from "./assert";
import type { ScenarioClient } from "./client";

export interface ScenarioContext {
  client: ScenarioClient;
  state: Record<string, unknown>;
  log: (msg: string) => void;
}

const CHILD_SCOPE_NAMES = [
  "Demo",
  "Framing",
  "Electrical",
  "Cabinets",
  "Punch",
] as const;

export async function runKitchen(ctx: ScenarioContext): Promise<void> {
  await day0(ctx);
  // await day3(ctx); await day10(ctx); …
}

async function day0(ctx: ScenarioContext): Promise<void> {
  ctx.log("── Day 0 — scaffold project, job, scope tree");
  const projectId = await createMainProject(ctx);
  const jobId = await createKitchenJob(ctx, projectId);
  const { rootId, childIds } = await createScopeTree(ctx, jobId);
  await updateCabinetsSpec(ctx, childIds.Cabinets);
  await verifyScopeTree(ctx, jobId, rootId);
}

async function createMainProject(ctx: ScenarioContext): Promise<string> {
  const { project } = await ctx.client.call<{
    project: { id: string; slug: string };
  }>("create_project", { name: "Main St Remodel", slug: "main-st" });
  assertTrue(project.id.startsWith("proj_"), "create_project returned an id");
  ctx.log(`  ✓ create_project → ${project.id} (${project.slug})`);
  ctx.state.projectId = project.id;
  return project.id;
}

async function createKitchenJob(
  ctx: ScenarioContext,
  projectId: string,
): Promise<string> {
  const { job } = await ctx.client.call<{
    job: { id: string; slug: string; projectId: string };
  }>("create_job", {
    projectId,
    name: "Kitchen",
    slug: "kitchen",
    address: "123 Main St",
  });
  assertEqual(job.projectId, projectId, "job.projectId matches");
  ctx.log(`  ✓ create_job    → ${job.id} (${job.slug})`);
  ctx.state.jobId = job.id;
  return job.id;
}

async function createScopeTree(
  ctx: ScenarioContext,
  jobId: string,
): Promise<{ rootId: string; childIds: Record<string, string> }> {
  const { scope: root } = await ctx.client.call<{
    scope: { id: string; name: string };
  }>("create_scope", { jobId, name: "Kitchen" });
  ctx.log(`  ✓ create_scope  → ${root.id} Kitchen (root)`);
  ctx.state.rootScopeId = root.id;

  const childIds: Record<string, string> = {};
  for (const name of CHILD_SCOPE_NAMES) {
    const { scope } = await ctx.client.call<{
      scope: { id: string; parentId?: string };
    }>("create_scope", { jobId, parentId: root.id, name });
    assertEqual(scope.parentId, root.id, `${name}.parentId is Kitchen`);
    ctx.log(`  ✓ create_scope  → ${scope.id} ${name}`);
    childIds[name] = scope.id;
  }
  return { rootId: root.id, childIds };
}

async function updateCabinetsSpec(
  ctx: ScenarioContext,
  cabinetsId: string | undefined,
): Promise<void> {
  assertTrue(cabinetsId !== undefined, "Cabinets scope was created");
  const { scope } = await ctx.client.call<{
    scope: { spec: { installNotes?: string } };
  }>("update_scope", {
    scopeId: cabinetsId,
    fields: {
      spec: {
        materials: [
          {
            sku: "IKEA-BODBYN-W-30",
            description: 'Base cabinet, white, 30"',
            quantity: 4,
          },
        ],
        installNotes: "Soft-close, level to countertop template",
      },
    },
  });
  assertEqual(
    scope.spec.installNotes,
    "Soft-close, level to countertop template",
    "Cabinets.spec.installNotes updated",
  );
  ctx.log("  ✓ update_scope  → Cabinets.spec set");
}

async function verifyScopeTree(
  ctx: ScenarioContext,
  jobId: string,
  rootId: string,
): Promise<void> {
  const { scopes } = await ctx.client.call<{
    scopes: Array<{ name: string; parentId?: string }>;
  }>("list_scopes", { jobId });
  assertEqual(
    scopes.map((s) => s.name),
    ["Kitchen", ...CHILD_SCOPE_NAMES],
    "list_scopes returns insertion-ordered tree",
  );
  assertEqual(
    scopes.filter((s) => s.parentId === rootId).length,
    CHILD_SCOPE_NAMES.length,
    "all non-root scopes hang off Kitchen",
  );
  ctx.log(`  ✓ list_scopes   → ${scopes.length} scopes, tree shape verified`);
}
