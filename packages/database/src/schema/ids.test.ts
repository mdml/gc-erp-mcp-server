import { describe, expect, it } from "vitest";
import {
  ActivationId,
  ActivityId,
  CommitmentId,
  CostId,
  DocumentId,
  JobId,
  NTPEventId,
  PartyId,
  PatchId,
  ProjectId,
  ScopeId,
} from "./ids";

// Minimal shape every branded ID schema satisfies. Using named imports (not
// a namespace-dynamic lookup) keeps biome's tree-shake rule happy.
type AnyBrand = { parse: (v: unknown) => string };

const ALL_IDS: Array<[string, AnyBrand]> = [
  ["ProjectId", ProjectId as unknown as AnyBrand],
  ["JobId", JobId as unknown as AnyBrand],
  ["ScopeId", ScopeId as unknown as AnyBrand],
  ["ActivityId", ActivityId as unknown as AnyBrand],
  ["CommitmentId", CommitmentId as unknown as AnyBrand],
  ["ActivationId", ActivationId as unknown as AnyBrand],
  ["NTPEventId", NTPEventId as unknown as AnyBrand],
  ["CostId", CostId as unknown as AnyBrand],
  ["PatchId", PatchId as unknown as AnyBrand],
  ["PartyId", PartyId as unknown as AnyBrand],
  ["DocumentId", DocumentId as unknown as AnyBrand],
];

describe("branded IDs", () => {
  it.each(ALL_IDS)("%s accepts a non-empty string", (_name, schema) => {
    expect(schema.parse("x")).toBe("x");
    expect(schema.parse("job_V1StGXR8_Z5jdHi6B-myT")).toBe(
      "job_V1StGXR8_Z5jdHi6B-myT",
    );
  });

  it.each(ALL_IDS)("%s rejects the empty string", (_name, schema) => {
    expect(() => schema.parse("")).toThrow();
  });

  it.each(ALL_IDS)("%s rejects non-strings", (_name, schema) => {
    expect(() => schema.parse(123 as unknown as string)).toThrow();
    expect(() => schema.parse(null as unknown as string)).toThrow();
  });
});
