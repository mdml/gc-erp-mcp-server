/**
 * issue_ntp — TOOLS.md §3.2; ADRs 0007, 0009.
 *
 * Issues an NTP event for an activation. The NTP row stores only
 * { id, activationId, issuedOn, note? }. startBy/finishBy are derived from
 * the CURRENT activation's leadTimeDays/buildTimeDays per ADR 0007 — never
 * denormalized onto the row. Voidedness is gated via the commitments.voided_at
 * column per ADR 0009 — no patches log scan.
 */

import {
  ActivationId,
  activations,
  commitments,
  IsoDay,
  NTPEvent,
  newNTPEventId,
  ntpEvents,
} from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type McpToolDef, McpToolError } from "./_mcp-tool";
import { addWorkingDays } from "./_working-days";

export const IssueNtpInput = z.object({
  activationId: ActivationId,
  issuedOn: IsoDay,
  note: z.string().optional(),
});

export const IssueNtpOutput = z.object({
  ntp: NTPEvent,
  startBy: IsoDay,
  finishBy: IsoDay,
});

export const issueNtp: McpToolDef<typeof IssueNtpInput, typeof IssueNtpOutput> =
  {
    name: "issue_ntp",
    description:
      "Issue a Notice to Proceed for an activation. Derives startBy = issuedOn + activation.leadTime and finishBy = startBy + activation.buildTime from current activation state (ADR 0007). Multiple NTPs per activation are allowed. Errors: not_found (activation unknown); invariant_violation (commitment voided per ADR 0009).",
    inputSchema: IssueNtpInput,
    outputSchema: IssueNtpOutput,
    handler: async ({ db, input }) => {
      const { activationId, issuedOn, note } = input;

      const row = await db
        .select({
          leadTimeDays: activations.leadTimeDays,
          buildTimeDays: activations.buildTimeDays,
          commitmentId: activations.commitmentId,
          voidedAt: commitments.voidedAt,
        })
        .from(activations)
        .innerJoin(commitments, eq(activations.commitmentId, commitments.id))
        .where(eq(activations.id, activationId))
        .get();

      if (!row) {
        throw new McpToolError(
          "not_found",
          `activation not found: ${activationId}`,
        );
      }

      if (row.voidedAt !== null) {
        throw new McpToolError(
          "invariant_violation",
          `cannot issue NTP against voided commitment ${row.commitmentId}`,
          { commitmentId: row.commitmentId, voidedAt: row.voidedAt },
        );
      }

      const startBy = addWorkingDays(issuedOn, row.leadTimeDays);
      const finishBy = addWorkingDays(startBy, row.buildTimeDays);

      const id = newNTPEventId();
      await db
        .insert(ntpEvents)
        .values({ id, activationId, issuedOn, note: note ?? null })
        .run();

      const ntp: NTPEvent = NTPEvent.parse({
        id,
        activationId,
        issuedOn,
        ...(note !== undefined ? { note } : {}),
      });

      return { ntp, startBy, finishBy };
    },
  };
