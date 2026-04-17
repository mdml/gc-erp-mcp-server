import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InfraConfig } from "../infra.config";
import * as client from "../lib/cloudflare-client";
import * as patcher from "../lib/wrangler-patcher";
import { applyD1, checkD1, type D1Database, planD1, teardownD1 } from "./d1";

vi.mock("../lib/cloudflare-client", () => ({
  cf: vi.fn(),
  accountPath: (suffix: string) =>
    `/accounts/acct-test${suffix.startsWith("/") ? suffix : `/${suffix}`}`,
}));

vi.mock("../lib/wrangler-patcher", () => ({
  patchWranglerJsonc: vi.fn(),
}));

const cfMock = vi.mocked(client.cf);
const patchMock = vi.mocked(patcher.patchWranglerJsonc);

const cfg: InfraConfig = {
  worker: { name: "gc-erp-mcp-server" },
  customDomain: { hostname: "gc.leiserson.me", zone: "leiserson.me" },
  d1: { databaseName: "gc-erp" },
  r2: { bucketName: "gc-erp-documents" },
};

function database(overrides: Partial<D1Database> = {}): D1Database {
  return {
    uuid: "db-uuid-1",
    name: "gc-erp",
    created_at: "2026-01-01T00:00:00Z",
    version: "production",
    num_tables: 0,
    file_size: 0,
    ...overrides,
  };
}

describe("checkD1", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns exists when the named database is found", async () => {
    cfMock.mockResolvedValueOnce([database()]);
    const s = await checkD1(cfg);
    expect(s.kind).toBe("exists");
    if (s.kind === "exists") {
      expect(s.database.uuid).toBe("db-uuid-1");
      expect(s.database.name).toBe("gc-erp");
    }
  });

  it("returns missing when the API returns an empty list", async () => {
    cfMock.mockResolvedValueOnce([]);
    const s = await checkD1(cfg);
    expect(s.kind).toBe("missing");
    if (s.kind === "missing") {
      expect(s.databaseName).toBe("gc-erp");
    }
  });

  it("returns missing when the named database is not in the list", async () => {
    cfMock.mockResolvedValueOnce([database({ name: "other-db" })]);
    const s = await checkD1(cfg);
    expect(s.kind).toBe("missing");
  });

  it("queries the D1 database list endpoint", async () => {
    cfMock.mockResolvedValueOnce([]);
    await checkD1(cfg);
    expect(cfMock).toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("/d1/database"),
    );
  });
});

describe("planD1", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("plans create when the database is missing", async () => {
    cfMock.mockResolvedValueOnce([]);
    const a = await planD1(cfg);
    expect(a.kind).toBe("create");
    if (a.kind === "create") {
      expect(a.databaseName).toBe("gc-erp");
    }
  });

  it("plans noop when the database already exists", async () => {
    cfMock.mockResolvedValueOnce([database()]);
    const a = await planD1(cfg);
    expect(a.kind).toBe("noop");
    if (a.kind === "noop") {
      expect(a.reason).toMatch(/uuid=/);
    }
  });
});

describe("applyD1", () => {
  beforeEach(() => {
    cfMock.mockReset();
    patchMock.mockReset();
  });

  it("noop makes zero API calls and skips wrangler.jsonc patching", async () => {
    await applyD1({
      kind: "noop",
      databaseName: "gc-erp",
      reason: "already exists",
    });
    expect(cfMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("create POSTs to /d1/database and patches wrangler.jsonc with the uuid", async () => {
    cfMock.mockResolvedValueOnce(database({ uuid: "new-uuid" }));
    await applyD1({ kind: "create", databaseName: "gc-erp" });
    expect(cfMock).toHaveBeenCalledWith(
      "POST",
      "/accounts/acct-test/d1/database",
      { name: "gc-erp" },
    );
    expect(patchMock).toHaveBeenCalledWith([
      {
        path: ["d1_databases"],
        value: [
          { binding: "DB", database_name: "gc-erp", database_id: "new-uuid" },
        ],
      },
    ]);
  });
});

describe("teardownD1", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns not-found when the database does not exist", async () => {
    cfMock.mockResolvedValueOnce([]);
    const r = await teardownD1(cfg);
    expect(r).toBe("not-found");
  });

  it("deletes the database by uuid and returns deleted", async () => {
    cfMock
      .mockResolvedValueOnce([database({ uuid: "del-uuid" })])
      .mockResolvedValueOnce(null);
    const r = await teardownD1(cfg);
    expect(r).toBe("deleted");
    expect(cfMock).toHaveBeenNthCalledWith(
      2,
      "DELETE",
      "/accounts/acct-test/d1/database/del-uuid",
    );
  });
});
