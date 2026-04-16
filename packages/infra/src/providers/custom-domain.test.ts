import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InfraConfig } from "../infra.config";
import * as client from "../lib/cloudflare-client";
import {
  applyCustomDomain,
  checkCustomDomain,
  planCustomDomain,
  teardownCustomDomain,
  type WorkerDomain,
} from "./custom-domain";

vi.mock("../lib/cloudflare-client", () => ({
  cf: vi.fn(),
  accountPath: (suffix: string) =>
    `/accounts/acct-test${suffix.startsWith("/") ? suffix : `/${suffix}`}`,
}));

const cfMock = vi.mocked(client.cf);

const cfg: InfraConfig = {
  worker: { name: "gc-erp-mcp-server" },
  customDomain: { hostname: "gc.leiserson.me", zone: "leiserson.me" },
};

function domain(overrides: Partial<WorkerDomain> = {}): WorkerDomain {
  return {
    id: "dom-1",
    zone_id: "zone-1",
    zone_name: "leiserson.me",
    hostname: "gc.leiserson.me",
    service: "gc-erp-mcp-server",
    environment: "production",
    ...overrides,
  };
}

describe("checkCustomDomain", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns attached when hostname + service match", async () => {
    cfMock.mockResolvedValueOnce([domain({ id: "dom-abc" })]);
    const s = await checkCustomDomain(cfg);
    expect(s.kind).toBe("attached");
    if (s.kind === "attached") {
      expect(s.id).toBe("dom-abc");
      expect(s.hostname).toBe("gc.leiserson.me");
    }
  });

  it("returns missing when the API returns an empty list", async () => {
    cfMock.mockResolvedValueOnce([]);
    const s = await checkCustomDomain(cfg);
    expect(s.kind).toBe("missing");
  });

  it("returns missing when the API returns null", async () => {
    cfMock.mockResolvedValueOnce(null);
    const s = await checkCustomDomain(cfg);
    expect(s.kind).toBe("missing");
  });

  it("returns drift when the hostname is attached to a different service", async () => {
    cfMock.mockResolvedValueOnce([
      domain({ service: "other-worker", id: "dom-x" }),
    ]);
    const s = await checkCustomDomain(cfg);
    expect(s.kind).toBe("drift");
    if (s.kind === "drift") {
      expect(s.existing.service).toBe("other-worker");
      expect(s.expected.service).toBe("gc-erp-mcp-server");
    }
  });
});

describe("planCustomDomain", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("plans wrangler-attach when the domain is missing", async () => {
    cfMock.mockResolvedValueOnce([]);
    const a = await planCustomDomain(cfg);
    expect(a.kind).toBe("wrangler-attach");
    if (a.kind === "wrangler-attach") {
      expect(a.hostname).toBe("gc.leiserson.me");
      expect(a.reason).toMatch(/wrangler\.jsonc/);
      expect(a.reason).toMatch(/bun run deploy/);
    }
  });

  it("plans noop when the domain is already attached to the right service", async () => {
    cfMock.mockResolvedValueOnce([domain()]);
    const a = await planCustomDomain(cfg);
    expect(a.kind).toBe("noop");
  });

  it("throws on drift rather than silently reattaching", async () => {
    cfMock.mockResolvedValueOnce([domain({ service: "other-worker" })]);
    await expect(planCustomDomain(cfg)).rejects.toThrow(/drift/);
  });
});

describe("applyCustomDomain", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("noop makes zero API calls", async () => {
    await applyCustomDomain({
      kind: "noop",
      hostname: "gc.leiserson.me",
      reason: "attached",
    });
    expect(cfMock).not.toHaveBeenCalled();
  });

  it("wrangler-attach makes zero API calls (wrangler owns the attach)", async () => {
    await applyCustomDomain({
      kind: "wrangler-attach",
      hostname: "gc.leiserson.me",
      reason: "declared in wrangler.jsonc",
    });
    expect(cfMock).not.toHaveBeenCalled();
  });
});

describe("teardownCustomDomain", () => {
  beforeEach(() => {
    cfMock.mockReset();
  });

  it("returns not-found when nothing is attached", async () => {
    cfMock.mockResolvedValueOnce([]);
    const r = await teardownCustomDomain(cfg);
    expect(r).toBe("not-found");
  });

  it("deletes the existing domain by id and returns detached", async () => {
    cfMock
      .mockResolvedValueOnce([domain({ id: "dom-xyz" })])
      .mockResolvedValueOnce(undefined);
    const r = await teardownCustomDomain(cfg);
    expect(r).toBe("detached");
    expect(cfMock).toHaveBeenNthCalledWith(
      2,
      "DELETE",
      "/accounts/acct-test/workers/domains/dom-xyz",
    );
  });

  it("detaches even when the hostname is drifted to another service", async () => {
    cfMock
      .mockResolvedValueOnce([
        domain({ id: "dom-drift", service: "other-worker" }),
      ])
      .mockResolvedValueOnce(undefined);
    const r = await teardownCustomDomain(cfg);
    expect(r).toBe("detached");
    expect(cfMock).toHaveBeenNthCalledWith(
      2,
      "DELETE",
      "/accounts/acct-test/workers/domains/dom-drift",
    );
  });
});
