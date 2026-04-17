import { describe, expect, it } from "vitest";
import {
  ActivationId,
  ActivityId,
  CommitmentId,
  CostId,
  JobId,
  NTPEventId,
  PartyId,
  ProjectId,
  ScopeId,
} from "../schema/ids";
import {
  newActivationId,
  newActivityId,
  newCommitmentId,
  newCostId,
  newJobId,
  newNTPEventId,
  newPartyId,
  newProjectId,
  newScopeId,
} from "./generate";

// Each branded ID schema has a different `$brand`; widen to a common shape
// for the test-table by accepting any z-parsable-to-string.
type AnyStringSchema = { parse: (v: unknown) => string };

const cases: Array<[string, () => string, AnyStringSchema]> = [
  ["proj_", newProjectId, ProjectId as unknown as AnyStringSchema],
  ["job_", newJobId, JobId as unknown as AnyStringSchema],
  ["scope_", newScopeId, ScopeId as unknown as AnyStringSchema],
  ["act_", newActivityId, ActivityId as unknown as AnyStringSchema],
  ["cm_", newCommitmentId, CommitmentId as unknown as AnyStringSchema],
  ["actv_", newActivationId, ActivationId as unknown as AnyStringSchema],
  ["ntp_", newNTPEventId, NTPEventId as unknown as AnyStringSchema],
  ["cost_", newCostId, CostId as unknown as AnyStringSchema],
  ["party_", newPartyId, PartyId as unknown as AnyStringSchema],
];

describe("id generators", () => {
  it.each(
    cases,
  )("produce %s-prefixed IDs that parse as their brand", (prefix, gen, schema) => {
    const id = gen();
    expect(id.startsWith(prefix)).toBe(true);
    // 21-char nanoid follows the prefix.
    expect(id.length).toBe(prefix.length + 21);
    expect(schema.parse(id)).toBe(id);
  });

  it.each(cases)("%s generator yields distinct values", (_prefix, gen) => {
    const a = gen();
    const b = gen();
    expect(a).not.toBe(b);
  });
});
