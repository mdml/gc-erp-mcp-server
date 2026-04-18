/**
 * get_scope_tree — TOOLS.md §4.
 *
 * Returns the scope tree for a job with committed/cost/variance rolled up
 * per node. Three straight-line queries + in-memory tree fold (spike §5.2);
 * suitable at v1 scale (5–20 scopes per job).
 *
 * Rollup rules (ADRs 0005, 0006, 0009):
 *   committed = sum(activation.pricePortionCents WHERE activation.scopeId ∈ subtree
 *                   AND commitment.voided_at IS NULL)
 *   cost      = sum(cost.amountCents WHERE cost.scopeId ∈ subtree)
 *               Costs from voided commitments survive (ADR 0006); no void filter.
 *   variance  = committed − cost  (positive = underbudget; negative = overspend)
 */

import {
  activations,
  commitments,
  costs,
  JobId,
  Money,
  ScopeId,
  scopes,
} from "@gc-erp/database";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { McpToolDef } from "./_mcp-tool";

type ScopeIdT = z.infer<typeof ScopeId>;
type MoneyT = z.infer<typeof Money>;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type ScopeNode = {
  id: ScopeIdT;
  name: string;
  parentId?: ScopeIdT;
  committed: MoneyT;
  cost: MoneyT;
  variance: MoneyT;
  children: ScopeNode[];
};

export const ScopeNodeSchema: z.ZodType<ScopeNode> = z.lazy(() =>
  z.object({
    id: ScopeId,
    name: z.string(),
    parentId: ScopeId.optional(),
    committed: Money,
    cost: Money,
    variance: Money,
    children: z.array(ScopeNodeSchema),
  }),
);

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export const GetScopeTreeInput = z.object({ jobId: JobId });
export const GetScopeTreeOutput = z.object({ tree: z.array(ScopeNodeSchema) });

// ---------------------------------------------------------------------------
// Tree-building helpers — each covers one phase of the fold
// ---------------------------------------------------------------------------

type ScopeRow = {
  id: ScopeIdT;
  parentId: ScopeIdT | null;
  name: string;
};

function buildNodeMap(scopeRows: ScopeRow[]): Map<ScopeIdT, ScopeNode> {
  const nodeMap = new Map<ScopeIdT, ScopeNode>();
  for (const row of scopeRows) {
    nodeMap.set(row.id, {
      id: row.id,
      name: row.name,
      ...(row.parentId !== null ? { parentId: row.parentId } : {}),
      committed: { cents: 0, currency: "USD" },
      cost: { cents: 0, currency: "USD" },
      variance: { cents: 0, currency: "USD" },
      children: [],
    });
  }
  return nodeMap;
}

function accumulateActivations(
  nodeMap: Map<ScopeIdT, ScopeNode>,
  activationRows: Array<{
    scopeId: ScopeIdT;
    pricePortionCents: number;
  }>,
): void {
  for (const act of activationRows) {
    const node = nodeMap.get(act.scopeId);
    if (node) node.committed.cents += act.pricePortionCents;
  }
}

function accumulateCosts(
  nodeMap: Map<ScopeIdT, ScopeNode>,
  costRows: Array<{ scopeId: ScopeIdT; amountCents: number }>,
): void {
  for (const costRow of costRows) {
    const node = nodeMap.get(costRow.scopeId);
    if (node) node.cost.cents += costRow.amountCents;
  }
}

function linkAndCollectRoots(nodeMap: Map<ScopeIdT, ScopeNode>): ScopeNode[] {
  const roots: ScopeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function rollUp(node: ScopeNode): void {
  for (const child of node.children) {
    rollUp(child);
    node.committed.cents += child.committed.cents;
    node.cost.cents += child.cost.cents;
  }
  node.variance.cents = node.committed.cents - node.cost.cents;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const getScopeTree: McpToolDef<
  typeof GetScopeTreeInput,
  typeof GetScopeTreeOutput
> = {
  name: "get_scope_tree",
  description:
    "Return the scope tree for a Job with committed/cost/variance rolled up per node and subtree. committed excludes voided commitments (ADR 0009 column predicate: voided_at IS NULL); cost includes costs against all commitments including voided ones (ADR 0006 — costs are historical events); variance = committed − cost (positive = underbudget; negative = overspend).",
  inputSchema: GetScopeTreeInput,
  outputSchema: GetScopeTreeOutput,
  handler: async ({ db, input }) => {
    const { jobId } = input;

    const [scopeRows, activationRows, costRows] = await Promise.all([
      db
        .select({ id: scopes.id, parentId: scopes.parentId, name: scopes.name })
        .from(scopes)
        .where(eq(scopes.jobId, jobId))
        .all(),
      db
        .select({
          scopeId: activations.scopeId,
          pricePortionCents: activations.pricePortionCents,
        })
        .from(activations)
        .innerJoin(commitments, eq(activations.commitmentId, commitments.id))
        .where(and(eq(commitments.jobId, jobId), isNull(commitments.voidedAt)))
        .all(),
      db
        .select({ scopeId: costs.scopeId, amountCents: costs.amountCents })
        .from(costs)
        .where(eq(costs.jobId, jobId))
        .all(),
    ]);

    const nodeMap = buildNodeMap(scopeRows);
    accumulateActivations(nodeMap, activationRows);
    accumulateCosts(nodeMap, costRows);
    const roots = linkAndCollectRoots(nodeMap);
    for (const root of roots) rollUp(root);

    return { tree: roots };
  },
};
