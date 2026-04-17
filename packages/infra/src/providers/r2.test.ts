import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InfraConfig } from "../infra.config";
import * as client from "../lib/cloudflare-client";
import * as patcher from "../lib/wrangler-patcher";
import { applyR2, checkR2, planR2, type R2Bucket, teardownR2 } from "./r2";

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

function bucket(overrides: Partial<R2Bucket> = {}): R2Bucket {
  return {
    name: "gc-erp-documents",
    creation_date: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("checkR2", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns exists when the named bucket is found", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [bucket()] });
    const s = await checkR2(cfg);
    expect(s.kind).toBe("exists");
    if (s.kind === "exists") {
      expect(s.bucket.name).toBe("gc-erp-documents");
    }
  });

  it("returns missing when the API returns no buckets", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [] });
    const s = await checkR2(cfg);
    expect(s.kind).toBe("missing");
    if (s.kind === "missing") {
      expect(s.bucketName).toBe("gc-erp-documents");
    }
  });

  it("returns missing when the named bucket is not in the list", async () => {
    cfMock.mockResolvedValueOnce({
      buckets: [bucket({ name: "other-bucket" })],
    });
    const s = await checkR2(cfg);
    expect(s.kind).toBe("missing");
  });

  it("queries the R2 buckets list endpoint", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [] });
    await checkR2(cfg);
    expect(cfMock).toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("/r2/buckets"),
    );
  });
});

describe("planR2", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("plans create when the bucket is missing", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [] });
    const a = await planR2(cfg);
    expect(a.kind).toBe("create");
    if (a.kind === "create") {
      expect(a.bucketName).toBe("gc-erp-documents");
    }
  });

  it("plans noop when the bucket already exists", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [bucket()] });
    const a = await planR2(cfg);
    expect(a.kind).toBe("noop");
    if (a.kind === "noop") {
      expect(a.reason).toMatch(/already exists/);
    }
  });
});

describe("applyR2", () => {
  beforeEach(() => {
    cfMock.mockReset();
    patchMock.mockReset();
  });

  it("noop makes zero API calls and skips wrangler.jsonc patching", async () => {
    await applyR2({
      kind: "noop",
      bucketName: "gc-erp-documents",
      reason: "already exists",
    });
    expect(cfMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("create POSTs to /r2/buckets and patches wrangler.jsonc", async () => {
    cfMock.mockResolvedValueOnce(undefined);
    await applyR2({ kind: "create", bucketName: "gc-erp-documents" });
    expect(cfMock).toHaveBeenCalledWith(
      "POST",
      "/accounts/acct-test/r2/buckets",
      { name: "gc-erp-documents" },
    );
    expect(patchMock).toHaveBeenCalledWith([
      {
        path: ["r2_buckets"],
        value: [{ binding: "DOCUMENTS", bucket_name: "gc-erp-documents" }],
      },
    ]);
  });
});

describe("teardownR2", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns not-found when the bucket does not exist", async () => {
    cfMock.mockResolvedValueOnce({ buckets: [] });
    const r = await teardownR2(cfg);
    expect(r).toBe("not-found");
  });

  it("deletes the bucket by name and returns deleted", async () => {
    cfMock
      .mockResolvedValueOnce({
        buckets: [bucket({ name: "gc-erp-documents" })],
      })
      .mockResolvedValueOnce(null);
    const r = await teardownR2(cfg);
    expect(r).toBe("deleted");
    expect(cfMock).toHaveBeenNthCalledWith(
      2,
      "DELETE",
      "/accounts/acct-test/r2/buckets/gc-erp-documents",
    );
  });
});
