import type { Commitment } from "../schema/commitments";

/**
 * Commitment price / activation sum invariant — SPEC §1:
 *
 *   sum(activation.pricePortion) == price.total                   (lump)
 *   sum(activation.pricePortion) == price.perUnit * estimatedUnits (unit)
 *
 * Kept as an app-layer validator because the check spans two fields on the
 * Commitment and can't be a SQL CHECK constraint without denormalizing
 * activations into the commitment row.
 *
 * Unit-price float precision: SPEC says `z.number().nonnegative()` for
 * `estimatedUnits`. We compare integer cents on both sides, so non-integer
 * unit estimates can only satisfy this check if the product happens to
 * round to a whole cent. Callers that pass fractional `estimatedUnits`
 * should be aware this can spuriously fail — for v1, all kitchen-walkthrough
 * examples use integer estimates.
 */

export class CommitmentInvariantError extends Error {
  constructor(
    readonly code: "price_total_mismatch",
    readonly expectedCents: number,
    readonly actualCents: number,
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
      expectedCents,
      activationTotalCents,
      `activation pricePortions sum to ${activationTotalCents} cents; expected ${expectedCents} from ${c.price.kind} price`,
    );
  }
}
