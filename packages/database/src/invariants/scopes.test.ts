import { describe, expect, it } from "vitest";
import type { JobId, ScopeId } from "../schema/ids";
import {
  assertScopeTreeInvariants,
  ScopeInvariantError,
  type ScopeNodeRef,
} from "./scopes";

const J1 = "job_1" as JobId;
const J2 = "job_2" as JobId;
const S = (id: string): ScopeId => id as ScopeId;

describe("assertScopeTreeInvariants", () => {
  it("accepts a root scope (no parentId)", () => {
    expect(() =>
      assertScopeTreeInvariants({ id: S("s1"), jobId: J1 }, []),
    ).not.toThrow();
  });

  it("accepts a child whose parent is same-job", () => {
    const parent: ScopeNodeRef = { id: S("s1"), jobId: J1 };
    expect(() =>
      assertScopeTreeInvariants(
        { id: S("s2"), jobId: J1, parentId: parent.id },
        [parent],
      ),
    ).not.toThrow();
  });

  it("rejects a parent on a different job", () => {
    const parent: ScopeNodeRef = { id: S("s1"), jobId: J2 };
    expect(() =>
      assertScopeTreeInvariants(
        { id: S("s2"), jobId: J1, parentId: parent.id },
        [parent],
      ),
    ).toThrow(ScopeInvariantError);
    try {
      assertScopeTreeInvariants(
        { id: S("s2"), jobId: J1, parentId: parent.id },
        [parent],
      );
    } catch (e) {
      expect((e as ScopeInvariantError).code).toBe("cross_job_parent");
    }
  });

  it("rejects when the parent isn't in the sibling set", () => {
    try {
      assertScopeTreeInvariants(
        { id: S("s2"), jobId: J1, parentId: S("ghost") },
        [],
      );
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ScopeInvariantError);
      expect((e as ScopeInvariantError).code).toBe("missing_parent");
    }
  });

  it("rejects a direct self-parent cycle", () => {
    // Candidate's parent is itself — an update reparenting a scope onto itself.
    // The sibling set already carries the candidate with its pre-update parent.
    const pre: ScopeNodeRef = { id: S("s1"), jobId: J1 };
    try {
      assertScopeTreeInvariants({ id: S("s1"), jobId: J1, parentId: S("s1") }, [
        pre,
      ]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ScopeInvariantError);
      expect((e as ScopeInvariantError).code).toBe("cycle");
    }
  });

  it("rejects an indirect cycle (s1 -> s2 -> s1)", () => {
    const s1: ScopeNodeRef = { id: S("s1"), jobId: J1, parentId: S("s2") };
    const s2: ScopeNodeRef = { id: S("s2"), jobId: J1 };
    try {
      assertScopeTreeInvariants({ id: S("s2"), jobId: J1, parentId: S("s1") }, [
        s1,
        s2,
      ]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ScopeInvariantError);
      expect((e as ScopeInvariantError).code).toBe("cycle");
    }
  });
});
