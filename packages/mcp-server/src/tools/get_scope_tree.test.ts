import {
  type ActivationId,
  type ActivityId,
  activities,
  type CommitmentId,
  type CostId,
  costs,
  type JobId,
  jobs,
  type PartyId,
  type ProjectId,
  parties,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { applyPatch } from "./apply_patch";
import { getScopeTree, type ScopeNode } from "./get_scope_tree";

// ---------------------------------------------------------------------------
// Shared fixture IDs — deterministic strings that mirror TOOLS.md §6 Day 3
// ---------------------------------------------------------------------------

const projectId = "proj_test" as ProjectId;
const jobId = "job_kitchen" as JobId;
const partyRogelio = "party_rogelio" as PartyId;

const scopeKitchen = "scope_kitchen" as ScopeId;
const scopeDemo = "scope_demo" as ScopeId;
const scopeFraming = "scope_framing" as ScopeId;
const scopeElec = "scope_elec" as ScopeId;
const scopeCabinets = "scope_cabinets" as ScopeId;
const scopePunch = "scope_punch_scope" as ScopeId; // avoid collision with actPunch

const actLumberDrop = "act_lumber_drop" as ActivityId;
const actFrame = "act_frame" as ActivityId;
const actPunch = "act_punch" as ActivityId;

const cFrame = "cm_frame" as CommitmentId;
const aDropId = "actv_drop" as ActivationId;
const aFrameId = "actv_frame" as ActivationId;
const aPunchId = "actv_punch" as ActivationId;

function usd(cents: number) {
  return { cents, currency: "USD" as const };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedBase() {
  const db = createTestDb();

  await db
    .insert(projects)
    .values({ id: projectId, name: "Main St", slug: "main-st" })
    .run();
  await db
    .insert(parties)
    .values({ id: partyRogelio, kind: "org", name: "Rogelio's Framing LLC" })
    .run();
  await db
    .insert(jobs)
    .values({ id: jobId, projectId, name: "Kitchen", slug: "kitchen" })
    .run();
  await db
    .insert(activities)
    .values([
      { id: actLumberDrop, slug: "lumber_drop", name: "Lumber Drop" },
      { id: actFrame, slug: "frame", name: "Frame" },
      { id: actPunch, slug: "punch", name: "Punch List" },
    ])
    .run();
  await db
    .insert(scopes)
    .values([
      { id: scopeKitchen, jobId, name: "Kitchen", spec: { materials: [] } },
      {
        id: scopeDemo,
        jobId,
        parentId: scopeKitchen,
        name: "Demo",
        spec: { materials: [] },
      },
      {
        id: scopeFraming,
        jobId,
        parentId: scopeKitchen,
        name: "Framing",
        spec: { materials: [] },
      },
      {
        id: scopeElec,
        jobId,
        parentId: scopeKitchen,
        name: "Electrical",
        spec: { materials: [] },
      },
      {
        id: scopeCabinets,
        jobId,
        parentId: scopeKitchen,
        name: "Cabinets",
        spec: { materials: [] },
      },
      {
        id: scopePunch,
        jobId,
        parentId: scopeKitchen,
        name: "Punch",
        spec: { materials: [] },
      },
    ])
    .run();

  return db;
}

async function seedFramingCommitment(db: ReturnType<typeof createTestDb>) {
  await applyPatch.handler({
    db,
    input: {
      jobId,
      message: "Rogelio framing contract",
      edits: [
        {
          op: "create",
          commitment: {
            id: cFrame,
            jobId,
            scopeIds: [scopeDemo, scopeFraming],
            counterpartyId: partyRogelio,
            price: { kind: "lump", total: usd(850_000) },
            activations: [
              {
                id: aDropId,
                activityId: actLumberDrop,
                scopeId: scopeDemo,
                pricePortion: usd(50_000),
                leadTime: { days: 5 },
                buildTime: { days: 1 },
              },
              {
                id: aFrameId,
                activityId: actFrame,
                scopeId: scopeFraming,
                pricePortion: usd(700_000),
                leadTime: { days: 3 },
                buildTime: { days: 3 },
              },
              {
                id: aPunchId,
                activityId: actPunch,
                scopeId: scopeDemo,
                pricePortion: usd(100_000),
                leadTime: { days: 0 },
                buildTime: { days: 1 },
              },
            ],
            signedOn: "2026-04-18",
          },
        },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Tree traversal helper
// ---------------------------------------------------------------------------

function findNodeOrNull(tree: ScopeNode[], id: ScopeId): ScopeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNodeOrNull(node.children, id);
    if (found) return found;
  }
  return null;
}

function findNode(tree: ScopeNode[], id: ScopeId): ScopeNode {
  const node = findNodeOrNull(tree, id);
  if (!node) throw new Error(`node ${id} not found in tree`);
  return node;
}

function allNodes(tree: ScopeNode[]): ScopeNode[] {
  return tree.flatMap((n) => [n, ...allNodes(n.children)]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("get_scope_tree", () => {
  it("empty job: all nodes have zero committed, cost, variance", async () => {
    const db = await seedBase();
    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    expect(tree).toHaveLength(1);
    const kitchen = findNode(tree, scopeKitchen);
    expect(kitchen.children).toHaveLength(5);

    for (const node of allNodes(tree)) {
      expect(node.committed).toEqual(usd(0));
      expect(node.cost).toEqual(usd(0));
      expect(node.variance).toEqual(usd(0));
    }
  });

  it("Day 3 fixture: c_frame activations roll up correctly per TOOLS.md §6", async () => {
    const db = await seedBase();
    await seedFramingCommitment(db);

    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    const kitchen = findNode(tree, scopeKitchen);
    const demo = findNode(tree, scopeDemo);
    const framing = findNode(tree, scopeFraming);
    const elec = findNode(tree, scopeElec);

    // Kitchen is the subtree root — rolls up everything
    expect(kitchen.committed).toEqual(usd(850_000));
    // Demo gets a_drop (50_000) + a_punch (100_000)
    expect(demo.committed).toEqual(usd(150_000));
    // Framing gets a_frame (700_000)
    expect(framing.committed).toEqual(usd(700_000));
    // No activations on Electrical
    expect(elec.committed).toEqual(usd(0));

    // Tree shape preserved
    expect(kitchen.children).toHaveLength(5);
    expect(kitchen.parentId).toBeUndefined();
    expect(demo.parentId).toBe(scopeKitchen);
  });

  it("void exclusion: voiding c_frame zeros all committed rollup (ADR 0009)", async () => {
    const db = await seedBase();
    await seedFramingCommitment(db);

    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "void c_frame",
        edits: [{ op: "void", commitmentId: cFrame, reason: "test" }],
      },
    });

    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    for (const node of allNodes(tree)) {
      expect(node.committed).toEqual(usd(0));
    }
  });

  it("cost rollup + variance: TOOLS.md §6 Day 14 numbers", async () => {
    const db = await seedBase();
    await seedFramingCommitment(db);

    // Insert $480 cost on Demo (TOOLS.md §6 Day 14)
    await db
      .insert(costs)
      .values({
        id: "cost_1" as CostId,
        jobId,
        scopeId: scopeDemo,
        commitmentId: cFrame,
        activityId: actLumberDrop,
        activationId: aDropId,
        counterpartyId: partyRogelio,
        amountCents: 48_000,
        incurredOn: "2026-05-04",
        source: {
          kind: "invoice",
          invoiceNumber: "LY-7791",
          receivedOn: "2026-05-04",
        },
        recordedAt: new Date().toISOString(),
      })
      .run();

    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    const kitchen = findNode(tree, scopeKitchen);
    const demo = findNode(tree, scopeDemo);
    const framing = findNode(tree, scopeFraming);

    expect(demo.cost).toEqual(usd(48_000));
    // variance = 150_000 − 48_000 = 102_000 (underbudget)
    expect(demo.variance).toEqual(usd(102_000));

    // Kitchen rolls up the cost from Demo
    expect(kitchen.cost).toEqual(usd(48_000));
    expect(kitchen.variance).toEqual(usd(802_000)); // 850_000 − 48_000

    // Framing has no cost
    expect(framing.cost).toEqual(usd(0));
    expect(framing.variance).toEqual(usd(700_000));
  });

  it("costs survive void: Demo shows overspend after c_frame voided (ADR 0006)", async () => {
    const db = await seedBase();
    await seedFramingCommitment(db);

    await db
      .insert(costs)
      .values({
        id: "cost_void_test" as CostId,
        jobId,
        scopeId: scopeDemo,
        commitmentId: cFrame,
        activityId: actLumberDrop,
        activationId: aDropId,
        counterpartyId: partyRogelio,
        amountCents: 48_000,
        incurredOn: "2026-05-04",
        source: {
          kind: "invoice",
          invoiceNumber: "LY-7791",
          receivedOn: "2026-05-04",
        },
        recordedAt: new Date().toISOString(),
      })
      .run();

    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "void c_frame",
        edits: [{ op: "void", commitmentId: cFrame, reason: "test" }],
      },
    });

    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    const demo = findNode(tree, scopeDemo);
    expect(demo.committed).toEqual(usd(0)); // voided → excluded from committed
    expect(demo.cost).toEqual(usd(48_000)); // cost survives void
    expect(demo.variance).toEqual({ cents: -48_000, currency: "USD" }); // overspend
  });

  it("subtree depth: grandchild activation rolls up through parent to root", async () => {
    const db = await seedBase();

    const scopeDemoDoors = "scope_demo_doors" as ScopeId;
    await db
      .insert(scopes)
      .values({
        id: scopeDemoDoors,
        jobId,
        parentId: scopeDemo,
        name: "Demo Doors",
        spec: { materials: [] },
      })
      .run();

    const cGrandchild = "cm_grandchild" as CommitmentId;
    const aGrandchild = "actv_grandchild" as ActivationId;
    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "grandchild activation test",
        edits: [
          {
            op: "create",
            commitment: {
              id: cGrandchild,
              jobId,
              scopeIds: [scopeDemoDoors],
              counterpartyId: partyRogelio,
              price: { kind: "lump", total: usd(10_000) },
              activations: [
                {
                  id: aGrandchild,
                  activityId: actFrame,
                  scopeId: scopeDemoDoors,
                  pricePortion: usd(10_000),
                  leadTime: { days: 1 },
                  buildTime: { days: 1 },
                },
              ],
            },
          },
        ],
      },
    });

    const { tree } = await getScopeTree.handler({ db, input: { jobId } });

    const kitchen = findNode(tree, scopeKitchen);
    const demo = findNode(tree, scopeDemo);
    const demoDoors = findNode(tree, scopeDemoDoors);

    // Grandchild owns 10_000
    expect(demoDoors.committed).toEqual(usd(10_000));
    // Demo rolls up from grandchild
    expect(demo.committed).toEqual(usd(10_000));
    // Kitchen rolls up through Demo
    expect(kitchen.committed).toEqual(usd(10_000));

    // Verify tree nesting: Demo Doors is a child of Demo
    const demoInTree = findNode(tree, scopeDemo);
    expect(demoInTree.children.some((c) => c.id === scopeDemoDoors)).toBe(true);
  });
});
