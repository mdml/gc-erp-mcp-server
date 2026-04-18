/**
 * Pure assertion helpers for the scenario runner.
 *
 * Kept tiny and framework-free so scenarios read like demo scripts rather
 * than vitest suites. Failures throw `ScenarioAssertionError` — the runner
 * catches it, prints the label + diff, and exits non-zero.
 *
 * JSON-stringify equality is deliberate: scenarios compare
 * MCP-over-the-wire payloads, which are already plain JSON. Avoiding
 * `node:assert.deepStrictEqual` keeps the dev-tools bundle Bun-first and
 * the output deterministic (single-line diffs, no node internals).
 */

import { foldPatches } from "@gc-erp/database/projections";
import type { Patch } from "@gc-erp/database/schema";

export class ScenarioAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioAssertionError";
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new ScenarioAssertionError(
      `${label}\n  expected: ${e}\n  actual:   ${a}`,
    );
  }
}

export function assertTrue(condition: boolean, label: string): void {
  if (!condition) throw new ScenarioAssertionError(label);
}

/**
 * Convenience for checking that an MCP response has the expected shape
 * without writing out the full JSON. Returns the narrowed value so callers
 * can chain.
 */
export function assertHasKey<K extends string>(
  obj: unknown,
  key: K,
  label: string,
): asserts obj is Record<K, unknown> {
  if (!obj || typeof obj !== "object" || !(key in obj)) {
    throw new ScenarioAssertionError(
      `${label}: expected object with key "${key}", got ${JSON.stringify(obj)}`,
    );
  }
}

/**
 * Minimal structural view of a `get_scope_tree` node. Scenarios already
 * type this narrowly; the parity helper only needs id + committed cents +
 * children, so it accepts that minimum shape.
 */
export interface ScopeTreeNodeForParity {
  id: string;
  name?: string;
  committed: { cents: number };
  children: ScopeTreeNodeForParity[];
}

/**
 * ADR 0008 §F3.2 parity check — fold every `apply_patch` call the scenario
 * has made, project activation pricePortions to their `scopeId`, and
 * reconstruct each scope node's expected `committed.cents` by summing that
 * node's direct attributions plus every descendant's expected total.
 * Compare against the actual `get_scope_tree` response. A mismatch means
 * the patches log and the materialized `commitments` / `activations` /
 * `commitment_scopes` tables have drifted — the exact bug-class ADR 0008's
 * D1-batch atomicity is designed to prevent, made observable here.
 *
 * Limitation (v1): this only compares rollup totals, not commitment
 * structure (activation counts, price shape, scopeIds array). A structural
 * parity check needs read access to the projection tables that no MCP
 * tool currently exposes; see this slice's PR body for the architectural
 * flag.
 */
export function assertPatchesRollupParity(
  patches: readonly Patch[],
  tree: readonly ScopeTreeNodeForParity[],
  label: string,
): void {
  const fold = foldPatches(patches);
  const directByScope = new Map<string, number>();
  for (const entry of fold.values()) {
    if (entry.voidedAt) continue; // matches get_scope_tree's voided_at IS NULL filter
    for (const a of entry.commitment.activations) {
      directByScope.set(
        a.scopeId,
        (directByScope.get(a.scopeId) ?? 0) + a.pricePortion.cents,
      );
    }
  }

  const expectedFor = (node: ScopeTreeNodeForParity): number => {
    const direct = directByScope.get(node.id) ?? 0;
    const kids = node.children.reduce((s, c) => s + expectedFor(c), 0);
    return direct + kids;
  };

  const walk = (node: ScopeTreeNodeForParity): void => {
    const expected = expectedFor(node);
    if (node.committed.cents !== expected) {
      const who = node.name ?? node.id;
      throw new ScenarioAssertionError(
        `${label}: scope ${who} committed parity mismatch\n` +
          `  expected (fold→rollup): ${expected} cents\n` +
          `  actual   (get_scope_tree): ${node.committed.cents} cents`,
      );
    }
    for (const c of node.children) walk(c);
  };
  for (const root of tree) walk(root);
}
