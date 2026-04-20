import {
  type ActivityId,
  activities,
  type CommitmentId,
  commitments,
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
import { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import {
  type CostEntryFormInput,
  resolveCostEntryFormContext,
} from "./cost_entry_form.resolver";

// ---------------------------------------------------------------------------
// Fixture — minimum rows the resolver touches: project → job, scope, party,
// activity, commitment. Activations and the commitment_scopes junction are
// not required because the resolver does not traverse them.
// ---------------------------------------------------------------------------

const projectId = "proj_t" as ProjectId;
const jobId = "job_t" as JobId;
const scopeId = "scope_t" as ScopeId;
const activityId = "act_t" as ActivityId;
const partyId = "party_sub" as PartyId;
const partyClientId = "party_client" as PartyId;
const commitmentId = "cm_t" as CommitmentId;

async function seed() {
  const db = createTestDb();
  await db
    .insert(projects)
    .values({ id: projectId, name: "Project", slug: "project" })
    .run();
  await db
    .insert(parties)
    .values([
      { id: partyId, kind: "org", name: "Rogelio's Framing LLC" },
      { id: partyClientId, kind: "person", name: "Client Name" },
    ])
    .run();
  await db
    .insert(jobs)
    .values({ id: jobId, projectId, name: "Kitchen Remodel", slug: "kitchen" })
    .run();
  await db
    .insert(scopes)
    .values({ id: scopeId, jobId, name: "Framing", spec: { materials: [] } })
    .run();
  await db
    .insert(activities)
    .values({ id: activityId, name: "Frame", slug: "frame" })
    .run();
  await db
    .insert(commitments)
    .values({
      id: commitmentId,
      jobId,
      counterpartyId: partyId,
      price: { kind: "lump", total: { cents: 850_000, currency: "USD" } },
    })
    .run();
  return db;
}

describe("resolveCostEntryFormContext", () => {
  it("resolves only jobName when only jobId is supplied", async () => {
    const db = await seed();
    const ctx = await resolveCostEntryFormContext(db, { jobId });
    expect(ctx).toEqual({ jobId, jobName: "Kitchen Remodel" });
  });

  it("resolves every pair when every ID is supplied", async () => {
    const db = await seed();
    const input: CostEntryFormInput = {
      jobId,
      scopeId,
      commitmentId,
      activityId,
      counterpartyId: partyClientId,
      amount: { cents: 12_345, currency: "USD" },
      incurredOn: "2026-05-04",
      memo: "Kitchen framing deposit",
    };
    const ctx = await resolveCostEntryFormContext(db, input);
    expect(ctx).toEqual({
      jobId,
      jobName: "Kitchen Remodel",
      scopeId,
      scopeName: "Framing",
      commitmentId,
      commitmentLabel: "Rogelio's Framing LLC",
      activityId,
      activityName: "Frame",
      counterpartyId: partyClientId,
      counterpartyName: "Client Name",
      amount: { cents: 12_345, currency: "USD" },
      incurredOn: "2026-05-04",
      memo: "Kitchen framing deposit",
    });
  });

  it("omits paired labels when their IDs are absent from input", async () => {
    const db = await seed();
    const ctx = await resolveCostEntryFormContext(db, {
      jobId,
      activityId,
    });
    expect(ctx).toEqual({
      jobId,
      jobName: "Kitchen Remodel",
      activityId,
      activityName: "Frame",
    });
    expect("scopeId" in ctx).toBe(false);
    expect("commitmentId" in ctx).toBe(false);
    expect("counterpartyId" in ctx).toBe(false);
  });

  it("passes through amount / incurredOn / memo even when no other IDs are supplied", async () => {
    const db = await seed();
    const ctx = await resolveCostEntryFormContext(db, {
      jobId,
      amount: { cents: 500, currency: "USD" },
      incurredOn: "2026-05-04",
      memo: "note",
    });
    expect(ctx.amount).toEqual({ cents: 500, currency: "USD" });
    expect(ctx.incurredOn).toBe("2026-05-04");
    expect(ctx.memo).toBe("note");
  });

  it("resolves commitmentLabel from the commitment's counterparty party name", async () => {
    const db = await seed();
    const ctx = await resolveCostEntryFormContext(db, { jobId, commitmentId });
    expect(ctx.commitmentLabel).toBe("Rogelio's Framing LLC");
  });

  // -----------------------------------------------------------------------
  // not_found branches — every queried ID that is absent becomes a
  // McpToolError that the MCP layer maps to isError:true.
  // -----------------------------------------------------------------------

  it("throws not_found when the jobId does not exist", async () => {
    const db = await seed();
    await expect(
      resolveCostEntryFormContext(db, { jobId: "job_missing" as JobId }),
    ).rejects.toMatchObject({
      name: "McpToolError",
      code: "not_found",
      details: { jobId: "job_missing" },
    });
  });

  it("throws not_found when scopeId is supplied but missing", async () => {
    const db = await seed();
    await expect(
      resolveCostEntryFormContext(db, {
        jobId,
        scopeId: "scope_missing" as ScopeId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found when commitmentId is supplied but missing", async () => {
    const db = await seed();
    await expect(
      resolveCostEntryFormContext(db, {
        jobId,
        commitmentId: "cm_missing" as CommitmentId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found when activityId is supplied but missing", async () => {
    const db = await seed();
    await expect(
      resolveCostEntryFormContext(db, {
        jobId,
        activityId: "act_missing" as ActivityId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found when counterpartyId is supplied but missing", async () => {
    const db = await seed();
    await expect(
      resolveCostEntryFormContext(db, {
        jobId,
        counterpartyId: "party_missing" as PartyId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws McpToolError (not a plain Error) so the MCP layer surfaces code + details", async () => {
    const db = await seed();
    try {
      await resolveCostEntryFormContext(db, {
        jobId: "job_nope" as JobId,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(McpToolError);
    }
  });
});
