import type { Commitment } from "../schema/commitments";

/**
 * Commitment invariants — SPEC §1.
 *
 * These are **post-fold** checks (ADR 0008, spike §1.5): when a Patch with
 * multiple edits is applied, `apply_patch` folds all edits into the resulting
 * Commitment state in-memory, then calls these validators on the final state.
 * Per-edit validation is wrong because intermediate states during a fold can
 * legitimately violate an invariant that the final state satisfies (e.g.
 * `addActivation` + `setPrice` in one patch — after the add but before the
 * setPrice, the price-vs-sum invariant fails, but the final state is valid).
 *
 * The validators are pure functions of a whole Commitment; the call site
 * decides when to invoke them. No DB reads here — caller supplies the
 * post-fold Commitment.
 *
 * Enforced invariants:
 *   1. Price matches activation sum (lump / unit).
 *   2. Every activation.scopeId ∈ commitment.scopeIds (ADR 0005).
 *
 * Unit-price float precision: SPEC says `z.number().nonnegative()` for
 * `estimatedUnits`. We compare integer cents on both sides, so non-integer
 * unit estimates can only satisfy this check if the product happens to
 * round to a whole cent. Callers that pass fractional `estimatedUnits`
 * should be aware this can spuriously fail — for v1, all kitchen-walkthrough
 * examples use integer estimates. (Tracked in backlog: "Fractional
 * `estimatedUnits` × integer cents.")
 */

export class CommitmentInvariantError extends Error {
  constructor(
    readonly code:
      | "price_total_mismatch"
      | "activation_scope_not_in_commitment",
    readonly details: Record<string, unknown>,
    message: string,
  ) {
    super(message);
    this.name = "CommitmentInvariantError";
  }
}

export function assertCommitmentPriceMatchesActivations(c: Commitment): void {
  const activationTotalCents = c.activations.reduce(
    (acc, a) => acc + a.pricePortion.cents,
    0,
  );
  const expectedCents =
    c.price.kind === "lump"
      ? c.price.total.cents
      : c.price.perUnit.cents * c.price.estimatedUnits;

  if (activationTotalCents !== expectedCents) {
    throw new CommitmentInvariantError(
      "price_total_mismatch",
      { expectedCents, actualCents: activationTotalCents, kind: c.price.kind },
      `activation pricePortions sum to ${activationTotalCents} cents; expected ${expectedCents} from ${c.price.kind} price`,
    );
  }
}

/**
 * Activation-scope inclusion — ADR 0005. Every activation's `scopeId` must
 * be one of the commitment's declared `scopeIds`. This is how the rollup
 * rule `scope.committed = sum(activation.pricePortion WHERE activation.scopeId
 * ∈ subtree(scope))` stays well-defined: an activation can't attribute its
 * price to a scope outside its commitment's coverage.
 */
export function assertActivationScopesInCommitment(c: Commitment): void {
  const declared = new Set(c.scopeIds);
  for (const a of c.activations) {
    if (!declared.has(a.scopeId)) {
      throw new CommitmentInvariantError(
        "activation_scope_not_in_commitment",
        {
          activationId: a.id,
          activationScopeId: a.scopeId,
          commitmentScopeIds: c.scopeIds,
        },
        `activation ${a.id} has scopeId ${a.scopeId}, not in commitment.scopeIds [${c.scopeIds.join(", ")}]`,
      );
    }
  }
}
