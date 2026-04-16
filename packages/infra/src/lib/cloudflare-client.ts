/**
 * Cloudflare REST API client.
 *
 * Sole-boundary invariant: this is the only module in packages/infra/ that
 * calls fetch(). All Cloudflare API access flows through `cf<T>(method, path, body?)`.
 * Enforced by sole-boundary.test.ts.
 *
 * Auth: `CLOUDFLARE_API_TOKEN` from process.env (loaded by direnv from 1Password).
 * Account-scoped paths use `accountPath(suffix)`, which reads
 * `CLOUDFLARE_ACCOUNT_ID` at call time (so tests can mock env per-test).
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 2_000] as const;

export interface CfError {
  code: number;
  message: string;
}

interface CfEnvelope<T> {
  success: boolean;
  errors: CfError[];
  messages: unknown[];
  result: T;
}

/** Thrown when the CF API returns success:false in its envelope. */
export class CloudflareApiError extends Error {
  readonly errors: CfError[];
  readonly path: string;
  readonly method: string;

  constructor(errors: CfError[], path: string, method: string) {
    const summary = errors.map((e) => e.message).join(", ");
    super(`Cloudflare API error on ${method} ${path}: ${summary}`);
    this.name = "CloudflareApiError";
    this.errors = errors;
    this.path = path;
    this.method = method;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "retry"; error: Error };

function buildInit(
  method: string,
  body: unknown,
  token: string | undefined,
): RequestInit {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token ?? ""}`,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

async function classifyResponse<T>(
  response: Response,
  method: string,
  path: string,
  attempt: number,
): Promise<AttemptResult<T>> {
  if (response.status === 429 || response.status >= 500) {
    return {
      kind: "retry",
      error: new Error(
        `HTTP ${response.status} on ${method} ${path} (attempt ${attempt + 1})`,
      ),
    };
  }
  const envelope = (await response.json()) as CfEnvelope<T>;
  if (!envelope.success) {
    throw new CloudflareApiError(envelope.errors, path, method);
  }
  return { kind: "ok", value: envelope.result };
}

/**
 * Make an authenticated CF REST API call with retry on 429/5xx.
 *
 * @param method  HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param path    API path, e.g. "/zones" or "/accounts/{id}/workers/domains"
 * @param body    Optional request body (serialized as JSON)
 * @returns       The `result` field of the CF success envelope
 * @throws        CloudflareApiError when the envelope reports success:false
 * @throws        Error when all retry attempts are exhausted (429/5xx)
 */
export async function cf<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${CF_BASE}${path}`;
  const init = buildInit(method, body, process.env.CLOUDFLARE_API_TOKEN);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 2_000);
    }
    // Fresh signal per attempt — a timed-out signal can't be reused across retries.
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(url, { ...init, signal });
    const result = await classifyResponse<T>(response, method, path, attempt);
    if (result.kind === "ok") return result.value;
    lastError = result.error;
  }

  throw lastError ?? new Error(`All attempts exhausted for ${method} ${path}`);
}

/**
 * Build an account-scoped API path.
 *
 * Reads `CLOUDFLARE_ACCOUNT_ID` at call time (not at module load) so tests
 * can set/unset it per-test without re-importing the module.
 */
export function accountPath(suffix: string): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not set in environment");
  }
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/accounts/${accountId}${normalized}`;
}
