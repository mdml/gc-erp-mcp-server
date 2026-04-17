import { parties } from "@gc-erp/database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./_test-db";
import { createParty } from "./create_party";

describe("create_party", () => {
  it("creates a person Party with no email", async () => {
    const db = createTestDb();
    const { party } = await createParty.handler({
      db,
      input: { kind: "person", name: "Salman Ahmad" },
    });
    expect(party.kind).toBe("person");
    expect(party.name).toBe("Salman Ahmad");
    expect(party.email).toBeUndefined();
    expect(party.id.startsWith("party_")).toBe(true);
  });

  it("creates a person Party with an email", async () => {
    const db = createTestDb();
    const { party } = await createParty.handler({
      db,
      input: {
        kind: "person",
        name: "Salman Ahmad",
        email: "salman@example.com",
      },
    });
    expect(party.email).toBe("salman@example.com");
  });

  it("creates an org Party", async () => {
    const db = createTestDb();
    const { party } = await createParty.handler({
      db,
      input: { kind: "org", name: "Rogelio's Framing LLC" },
    });
    expect(party.kind).toBe("org");
    expect(party.name).toBe("Rogelio's Framing LLC");
    expect(party.id.startsWith("party_")).toBe(true);
  });

  it("persists to the parties table and reads back equivalently", async () => {
    const db = createTestDb();
    const { party } = await createParty.handler({
      db,
      input: {
        kind: "org",
        name: "Acme Plumbing",
        email: "ops@acme.test",
      },
    });
    const row = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
      .get();
    expect(row?.id).toBe(party.id);
    expect(row?.kind).toBe("org");
    expect(row?.name).toBe("Acme Plumbing");
    expect(row?.email).toBe("ops@acme.test");
  });

  it("stores email as NULL when omitted", async () => {
    const db = createTestDb();
    const { party } = await createParty.handler({
      db,
      input: { kind: "person", name: "Max" },
    });
    const row = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
      .get();
    expect(row?.email).toBeNull();
  });

  it("generates unique ids across calls and allows duplicate names", async () => {
    const db = createTestDb();
    const { party: a } = await createParty.handler({
      db,
      input: { kind: "org", name: "Rogelio's Framing LLC" },
    });
    const { party: b } = await createParty.handler({
      db,
      input: { kind: "org", name: "Rogelio's Framing LLC" },
    });
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe(b.name);
  });
});
