import {
  type ActivationId,
  type ActivityId,
  activities,
  type CommitmentId,
  type JobId,
  jobs,
  ntpEvents,
  type PartyId,
  type ProjectId,
  parties,
  projects,
  type ScopeId,
  scopes,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { McpToolError } from "./_mcp-tool";
import { createTestDb } from "./_test-db";
import { applyPatch } from "./apply_patch";
import { issueNtp } from "./issue_ntp";

// ---------------------------------------------------------------------------
// Fixture constants — deterministic string ids cast to branded types.
// Production code uses the new*Id() generators; tests cast literals so
// assertions can reference ids by name without capturing return values.
// ---------------------------------------------------------------------------

const projectId = "proj_test" as ProjectId;
const jobId = "job_kitchen" as JobId;
const partyRogelio = "party_rogelio" as PartyId;
const scopeKitchen = "scope_kitchen" as ScopeId;
const scopeDemo = "scope_demo" as ScopeId;
const actDrop = "act_lumber_drop" as ActivityId;

const commitmentId = "cm_drop" as CommitmentId;
const activationId = "actv_drop" as ActivationId;

function usd(cents: number) {
  return { cents, currency: "USD" as const };
}

async function seedBase() {
  const db = createTestDb();
  await db
    .insert(projects)
    .values({ id: projectId, name: "Main St Remodel", slug: "main-st" })
    .run();
  await db
    .insert(parties)
    .values({ id: partyRogelio, kind: "org", name: "Rogelio's LLC" })
    .run();
  await db
    .insert(jobs)
    .values({ id: jobId, projectId, name: "Kitchen", slug: "kitchen" })
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
    ])
    .run();
  await db
    .insert(activities)
    .values({ id: actDrop, name: "Lumber Drop", slug: "lumber_drop" })
    .run();
  return db;
}

/** Seeds base tables + one commitment with the given lead/build times. */
async function seedWithCommitment(leadTimeDays = 5, buildTimeDays = 1) {
  const db = await seedBase();
  await applyPatch.handler({
    db,
    input: {
      jobId,
      message: "Rogelio contract",
      edits: [
        {
          op: "create",
          commitment: {
            id: commitmentId,
            jobId,
            scopeIds: [scopeDemo],
            counterpartyId: partyRogelio,
            price: { kind: "lump", total: usd(50_000) },
            activations: [
              {
                id: activationId,
                activityId: actDrop,
                scopeId: scopeDemo,
                pricePortion: usd(50_000),
                leadTime: { days: leadTimeDays },
                buildTime: { days: buildTimeDays },
              },
            ],
          },
        },
      ],
    },
  });
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("issue_ntp", () => {
  it("happy path — TOOLS §6 Day 10: lead 5 + build 1 → startBy 2026-05-04, finishBy 2026-05-05", async () => {
    const db = await seedWithCommitment(5, 1);

    const result = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-04-27" },
    });

    expect(result.startBy).toBe("2026-05-04");
    expect(result.finishBy).toBe("2026-05-05");
    expect(result.ntp.id.startsWith("ntp_")).toBe(true);
    expect(result.ntp.activationId).toBe(activationId);
    expect(result.ntp.issuedOn).toBe("2026-04-27");

    const rows = await db
      .select()
      .from(ntpEvents)
      .where(eq(ntpEvents.activationId, activationId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(result.ntp.id);
  });

  it("multiple NTPs per activation — both rows persist", async () => {
    const db = await seedWithCommitment(5, 1);

    const r1 = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-04-27" },
    });
    const r2 = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-05-01" },
    });

    expect(r1.ntp.id).not.toBe(r2.ntp.id);

    const rows = await db
      .select()
      .from(ntpEvents)
      .where(eq(ntpEvents.activationId, activationId))
      .all();
    expect(rows).toHaveLength(2);
  });

  it("not_found on unknown activationId", async () => {
    const db = await seedWithCommitment();

    await expect(
      issueNtp.handler({
        db,
        input: {
          activationId: "actv_unknown" as ActivationId,
          issuedOn: "2026-04-27",
        },
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("actv_unknown"),
    } satisfies Partial<McpToolError>);
  });

  it("invariant_violation on voided commitment", async () => {
    const db = await seedWithCommitment();

    await applyPatch.handler({
      db,
      input: {
        jobId,
        message: "void contract",
        edits: [{ op: "void", commitmentId, reason: "test void" }],
      },
    });

    await expect(
      issueNtp.handler({
        db,
        input: { activationId, issuedOn: "2026-04-27" },
      }),
    ).rejects.toMatchObject({
      code: "invariant_violation",
      message: expect.stringContaining("voided"),
    } satisfies Partial<McpToolError>);
  });

  it("zero lead + zero build + weekday issuedOn → startBy and finishBy both equal issuedOn", async () => {
    const db = await seedWithCommitment(0, 0);

    const result = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-04-27" },
    });

    expect(result.startBy).toBe("2026-04-27");
    expect(result.finishBy).toBe("2026-04-27");
  });

  it("note round-trips when provided", async () => {
    const db = await seedWithCommitment();

    const result = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-04-27", note: "site clear" },
    });

    expect(result.ntp.note).toBe("site clear");

    const row = await db
      .select()
      .from(ntpEvents)
      .where(eq(ntpEvents.id, result.ntp.id))
      .get();
    expect(row?.note).toBe("site clear");
  });

  it("note is NULL in db when omitted", async () => {
    const db = await seedWithCommitment();

    const result = await issueNtp.handler({
      db,
      input: { activationId, issuedOn: "2026-04-27" },
    });

    expect(result.ntp.note).toBeUndefined();

    const row = await db
      .select()
      .from(ntpEvents)
      .where(eq(ntpEvents.id, result.ntp.id))
      .get();
    expect(row?.note).toBeNull();
  });
});
