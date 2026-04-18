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

import { newActivationId, newCommitmentId } from "@gc-erp/database/ids";
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
  await day3(ctx);
  await day10(ctx);
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

// ---------------------------------------------------------------------------
// Day 3 — first commitment (TOOLS.md §6 Day 3)
// ---------------------------------------------------------------------------

interface ScopeNodeLike {
  id: string;
  committed: { cents: number; currency: string };
  cost: { cents: number; currency: string };
  variance: { cents: number; currency: string };
  children: ScopeNodeLike[];
}

function findTreeNodeOrNull(
  tree: ScopeNodeLike[],
  id: string,
): ScopeNodeLike | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findTreeNodeOrNull(node.children, id);
    if (found) return found;
  }
  return null;
}

function findTreeNode(tree: ScopeNodeLike[], id: string): ScopeNodeLike {
  const node = findTreeNodeOrNull(tree, id);
  if (!node) throw new Error(`scope ${id} not found in scope tree`);
  return node;
}

async function day3(ctx: ScenarioContext): Promise<void> {
  ctx.log("── Day 3 — first commitment (Rogelio framing contract)");
  const jobId = ctx.state.jobId as string;

  const scopeIds = await lookupScopeIdsByName(ctx, jobId);
  const partyRogelioId = await createRogelioParty(ctx);
  const actIds = await ensureFramingActivities(ctx);

  const cFrameId = newCommitmentId();
  const aDropId = newActivationId();
  const aFrameId = newActivationId();
  const aPunchId = newActivationId();

  await applyFramingCommitment(ctx, {
    jobId,
    cFrameId,
    aDropId,
    aFrameId,
    aPunchId,
    partyRogelioId,
    actIds,
    scopeIds,
  });

  await verifyDay3ScopeTree(ctx, jobId, scopeIds);

  ctx.state.partyRogelioId = partyRogelioId;
  ctx.state.cFrameId = cFrameId;
  ctx.state.aDropId = aDropId;
  ctx.state.aFrameId = aFrameId;
  ctx.state.aPunchId = aPunchId;
}

async function lookupScopeIdsByName(
  ctx: ScenarioContext,
  jobId: string,
): Promise<{ demo: string; framing: string; kitchen: string }> {
  const { scopes } = await ctx.client.call<{
    scopes: Array<{ id: string; name: string }>;
  }>("list_scopes", { jobId });

  const find = (name: string): string => {
    const s = scopes.find((scope) => scope.name === name);
    assertTrue(s !== undefined, `${name} scope exists`);
    return (s as { id: string }).id;
  };

  return {
    demo: find("Demo"),
    framing: find("Framing"),
    kitchen: find("Kitchen"),
  };
}

async function createRogelioParty(ctx: ScenarioContext): Promise<string> {
  const { party } = await ctx.client.call<{
    party: { id: string; name: string };
  }>("create_party", { kind: "org", name: "Rogelio's Framing LLC" });
  assertTrue(
    party.id.startsWith("party_"),
    "create_party returned a party_ id",
  );
  ctx.log(`  ✓ create_party  → ${party.id} (${party.name})`);
  return party.id;
}

async function ensureFramingActivities(
  ctx: ScenarioContext,
): Promise<{ lumberDrop: string; frame: string; punch: string }> {
  const ensure = async (slug: string, name: string): Promise<string> => {
    const { activity } = await ctx.client.call<{
      activity: { id: string; slug: string };
    }>("ensure_activity", { slug, name });
    ctx.log(`  ✓ ensure_activity → ${activity.id} (${activity.slug})`);
    return activity.id;
  };

  return {
    lumberDrop: await ensure("lumber_drop", "Lumber Drop"),
    frame: await ensure("frame", "Frame"),
    punch: await ensure("punch", "Punch List"),
  };
}

interface FramingCommitmentArgs {
  jobId: string;
  cFrameId: string;
  aDropId: string;
  aFrameId: string;
  aPunchId: string;
  partyRogelioId: string;
  actIds: { lumberDrop: string; frame: string; punch: string };
  scopeIds: { demo: string; framing: string };
}

async function applyFramingCommitment(
  ctx: ScenarioContext,
  args: FramingCommitmentArgs,
): Promise<void> {
  const { patch } = await ctx.client.call<{ patch: { id: string } }>(
    "apply_patch",
    {
      jobId: args.jobId,
      message: "Rogelio framing contract",
      edits: [
        {
          op: "create",
          commitment: {
            id: args.cFrameId,
            jobId: args.jobId,
            scopeIds: [args.scopeIds.demo, args.scopeIds.framing],
            counterpartyId: args.partyRogelioId,
            price: { kind: "lump", total: { cents: 850_000, currency: "USD" } },
            activations: [
              {
                id: args.aDropId,
                activityId: args.actIds.lumberDrop,
                scopeId: args.scopeIds.demo,
                pricePortion: { cents: 50_000, currency: "USD" },
                leadTime: { days: 5 },
                buildTime: { days: 1 },
              },
              {
                id: args.aFrameId,
                activityId: args.actIds.frame,
                scopeId: args.scopeIds.framing,
                pricePortion: { cents: 700_000, currency: "USD" },
                leadTime: { days: 3 },
                buildTime: { days: 3 },
              },
              {
                id: args.aPunchId,
                activityId: args.actIds.punch,
                scopeId: args.scopeIds.demo,
                pricePortion: { cents: 100_000, currency: "USD" },
                leadTime: { days: 0 },
                buildTime: { days: 1 },
              },
            ],
            signedOn: "2026-04-18",
          },
        },
      ],
    },
  );
  ctx.log(`  ✓ apply_patch   → ${patch.id} (c_frame created)`);
}

async function verifyDay3ScopeTree(
  ctx: ScenarioContext,
  jobId: string,
  scopeIds: { kitchen: string; demo: string; framing: string },
): Promise<void> {
  const { tree } = await ctx.client.call<{ tree: ScopeNodeLike[] }>(
    "get_scope_tree",
    { jobId },
  );

  const kitchen = findTreeNode(tree, scopeIds.kitchen);
  const demo = findTreeNode(tree, scopeIds.demo);
  const framing = findTreeNode(tree, scopeIds.framing);

  assertEqual(
    kitchen.committed.cents,
    850_000,
    "Kitchen.committed = 850_000 cents",
  );
  assertEqual(
    demo.committed.cents,
    150_000,
    "Demo.committed = 150_000 cents (drop + punch)",
  );
  assertEqual(
    framing.committed.cents,
    700_000,
    "Framing.committed = 700_000 cents",
  );

  ctx.log("  ✓ get_scope_tree → Kitchen=$8,500  Demo=$1,500  Framing=$7,000");
}

// ---------------------------------------------------------------------------
// Day 10 — NTP for the lumber drop (TOOLS.md §6 Day 10)
// ---------------------------------------------------------------------------

async function day10(ctx: ScenarioContext): Promise<void> {
  ctx.log("── Day 10 — NTP on the lumber drop activation");
  const aDropId = ctx.state.aDropId as string;

  const { ntp, startBy, finishBy } = await ctx.client.call<{
    ntp: { id: string; activationId: string; issuedOn: string };
    startBy: string;
    finishBy: string;
  }>("issue_ntp", { activationId: aDropId, issuedOn: "2026-04-27" });

  assertTrue(ntp.id.startsWith("ntp_"), "issue_ntp returned an ntp_ id");
  assertEqual(ntp.activationId, aDropId, "NTP targets the lumber drop");
  assertEqual(startBy, "2026-05-04", "startBy = Mon 2026-05-04 (lead 5 wd)");
  assertEqual(finishBy, "2026-05-05", "finishBy = Tue 2026-05-05 (build 1 wd)");

  ctx.log(
    `  ✓ issue_ntp     → ${ntp.id} (startBy ${startBy}, finishBy ${finishBy})`,
  );
}
