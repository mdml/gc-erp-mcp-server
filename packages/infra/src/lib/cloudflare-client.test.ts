import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountPath, CloudflareApiError, cf } from "./cloudflare-client";

type FetchMock = ReturnType<typeof vi.fn>;

const originalFetch = globalThis.fetch;
const originalToken = process.env.CLOUDFLARE_API_TOKEN;
const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID;

function okResponse<T>(result: T): Response {
  return new Response(
    JSON.stringify({ success: true, errors: [], messages: [], result }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function failResponse(
  errors: Array<{ code: number; message: string }>,
): Response {
  return new Response(
    JSON.stringify({ success: false, errors, messages: [], result: null }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("cf", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.CLOUDFLARE_API_TOKEN = originalToken;
    vi.useRealTimers();
  });

  it("sends Authorization: Bearer <token> on a GET request", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await cf("GET", "/zones");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-token");
    expect((init as RequestInit).method).toBe("GET");
    // No body on GET, no content-type header set.
    expect(headers["content-type"]).toBeUndefined();
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("serializes body and sets content-type for PUT/POST", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "abc" }));
    const result = await cf<{ id: string }>("PUT", "/foo", { x: 1 });
    expect(result).toEqual({ id: "abc" });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify({ x: 1 }));
  });

  it("returns envelope.result on success", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([{ id: "z1", name: "leiserson.me" }]),
    );
    const result = await cf<Array<{ id: string; name: string }>>(
      "GET",
      "/zones",
    );
    expect(result).toEqual([{ id: "z1", name: "leiserson.me" }]);
  });

  it("throws CloudflareApiError when envelope.success is false", async () => {
    fetchMock.mockResolvedValueOnce(
      failResponse([{ code: 10000, message: "Authentication error" }]),
    );
    await expect(cf("GET", "/zones")).rejects.toThrow(/Authentication error/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then returns the eventual success result", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(okResponse("ok"));
    vi.useFakeTimers();
    const promise = cf<string>("GET", "/retry");
    // First attempt fires immediately, retry sleeps for 1000ms.
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 then throws after 3 exhausted attempts", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    vi.useFakeTimers();
    const promise = cf("GET", "/always500");
    // Prevent unhandled-rejection noise while advancing timers.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(promise).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("CloudflareApiError", () => {
  it("concatenates error messages and includes method + path", () => {
    const err = new CloudflareApiError(
      [
        { code: 1, message: "one" },
        { code: 2, message: "two" },
      ],
      "/foo",
      "POST",
    );
    expect(err.message).toContain("POST /foo");
    expect(err.message).toContain("one, two");
    expect(err.name).toBe("CloudflareApiError");
    expect(err.errors).toHaveLength(2);
  });
});

describe("accountPath", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-123";
  });

  afterEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
  });

  it("prefixes a path with /accounts/<id>", () => {
    expect(accountPath("/workers/domains")).toBe(
      "/accounts/acct-123/workers/domains",
    );
  });

  it("adds a leading slash when the suffix doesn't have one", () => {
    expect(accountPath("workers/domains")).toBe(
      "/accounts/acct-123/workers/domains",
    );
  });

  it("throws a clear error when CLOUDFLARE_ACCOUNT_ID is unset", () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(() => accountPath("/x")).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });
});
