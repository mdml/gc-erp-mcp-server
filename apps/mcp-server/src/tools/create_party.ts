/**
 * create_party — TOOLS.md §3.1.
 *
 * Creates a Party (person or org). Parties have no uniqueness constraints —
 * two "Rogelio's Framing LLC" orgs or two people sharing an email are both
 * legal, because role is resolved via the commitment/job a Party attaches to,
 * not by identity here (SPEC §1). Zod handles input validation (enum on
 * `kind`, email format); the handler is a straight insert.
 */

import { newPartyId, Party, parties } from "@gc-erp/database";
import { z } from "zod";
import type { McpToolDef } from "./_mcp-tool";

export const CreatePartyInput = z.object({
  kind: z.enum(["person", "org"]),
  name: z.string(),
  email: z.string().email().optional(),
});

export const CreatePartyOutput = z.object({ party: Party });

export const createParty: McpToolDef<
  typeof CreatePartyInput,
  typeof CreatePartyOutput
> = {
  name: "create_party",
  description:
    "Create a Party (person or org). Used for subs, clients, self. No uniqueness constraints — role is resolved by the commitment/job the Party attaches to. Returns the created Party.",
  inputSchema: CreatePartyInput,
  outputSchema: CreatePartyOutput,
  handler: async ({ db, input }) => {
    const id = newPartyId();
    await db
      .insert(parties)
      .values({
        id,
        kind: input.kind,
        name: input.name,
        email: input.email,
      })
      .run();

    const party: Party = Party.parse({
      id,
      kind: input.kind,
      name: input.name,
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    return { party };
  },
};
