import { describe, expect, it } from "vitest";
import type { Cost } from "../schema/costs";
import type {
  ActivityId,
  CommitmentId,
  CostId,
  JobId,
  PartyId,
  ScopeId,
} from "../schema/ids";
import { assertCostReferencesSameJob, CostInvariantError } from "./costs";

const usd = (cents: number) => ({ cents, currency: "USD" as const });

const cost: Cost = {
  id: "cost_1" as CostId,
  jobId: "job_kitchen" as JobId,
  scopeId: "scope_demo" as ScopeId,
  commitmentId: "cm_frame" as CommitmentId,
  activityId: "act_drop" as ActivityId,
  counterpartyId: "party_r" as PartyId,
  amount: usd(48_000),
  incurredOn: "2026-05-04",
  source: {
    kind: "invoice",
    invoiceNumber: "LY-7791",
    receivedOn: "2026-05-04",
  },
  recordedAt: "2026-05-04T10:00:00Z",
};

describe("assertCostReferencesSameJob", () => {
  it("accepts matching job across scope + commitment", () => {
    expect(() =>
      assertCostReferencesSameJob(cost, {
        scope: { id: cost.scopeId, jobId: cost.jobId },
        commitment: { id: cost.commitmentId, jobId: cost.jobId },
      }),
    ).not.toThrow();
  });

  it("rejects a cross-job scope", () => {
    try {
      assertCostReferencesSameJob(cost, {
        scope: { id: cost.scopeId, jobId: "job_other" as JobId },
        commitment: { id: cost.commitmentId, jobId: cost.jobId },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CostInvariantError);
      expect((e as CostInvariantError).code).toBe("scope_job_mismatch");
    }
  });

  it("rejects a cross-job commitment", () => {
    try {
      assertCostReferencesSameJob(cost, {
        scope: { id: cost.scopeId, jobId: cost.jobId },
        commitment: { id: cost.commitmentId, jobId: "job_other" as JobId },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CostInvariantError);
      expect((e as CostInvariantError).code).toBe("commitment_job_mismatch");
    }
  });
});
