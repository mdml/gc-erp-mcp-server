/**
 * Pure argv + config resolution for the scenario runner. Kept separate
 * from `run.ts` so the destructive-UX surface (target resolution, bearer
 * check, URL choice) is unit-testable without spawning the actual MCP
 * transport.
 *
 * `run.ts` is excluded from coverage as thin I/O wiring; this module
 * carries the covered logic.
 */

export type Target = "local" | "prod";

export const TARGET_URLS: Record<Target, string> = {
  local: "http://localhost:8787/mcp",
  prod: "https://gc.leiserson.me/mcp",
};

const NON_PROD_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

/**
 * Decide whether a server URL points at a prod-like host. This — not the
 * `--target` flag — is what gates the confirm prompt: `--target local`
 * combined with an overriding `MCP_SERVER_URL=https://gc.leiserson.me/mcp`
 * would otherwise hit prod without a confirm.
 *
 * Non-prod hosts: entries in `NON_PROD_HOSTNAMES` + any `*.local` hostname
 * (mDNS / Bonjour). Everything else is prod-like. On parse failure the
 * default is **prod-like** — safer to over-prompt than miss a real host.
 */
export function isProdLikeUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  // `URL` wraps IPv6 hostnames in brackets when re-serialized, but
  // `.hostname` returns them without brackets. Strip anyway for safety.
  const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (NON_PROD_HOSTNAMES.has(bare)) return false;
  if (bare.endsWith(".local")) return false;
  return true;
}

export interface ParsedArgs {
  name: string | null;
  reset: boolean;
  list: boolean;
  help: boolean;
  target: Target;
  yes: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = {
    name: null,
    reset: false,
    list: false,
    help: false,
    target: "local",
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reset") out.reset = true;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--target") {
      const v = argv[i + 1];
      if (v !== "local" && v !== "prod") {
        throw new Error(
          `--target must be "local" or "prod" (got: ${v ?? "<missing>"})`,
        );
      }
      out.target = v;
      i++;
    } else if (a.startsWith("--target=")) {
      const v = a.slice("--target=".length);
      if (v !== "local" && v !== "prod") {
        throw new Error(`--target must be "local" or "prod" (got: ${v})`);
      }
      out.target = v;
    } else if (!a.startsWith("-") && out.name === null) {
      out.name = a;
    }
  }
  return out;
}

export interface ResolvedConfig {
  name: string;
  target: Target;
  url: string;
  bearer: string;
  reset: boolean;
  yes: boolean;
}

export type ResolveResult =
  | { ok: true; config: ResolvedConfig }
  | { ok: false; code: number; message: string };

/**
 * Pure config resolver — takes the parsed args + env + list of known
 * scenario names and returns either a RunConfig or an exit code + human
 * message. Callers (`run.ts`) handle printing + exiting.
 */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export function resolveConfig(
  args: ParsedArgs,
  env: EnvLike,
  knownScenarios: readonly string[],
): ResolveResult {
  if (!args.name) {
    return { ok: false, code: 2, message: "scenario name is required" };
  }
  if (!knownScenarios.includes(args.name)) {
    return {
      ok: false,
      code: 2,
      message: `unknown scenario: ${args.name}`,
    };
  }
  const bearer = env.MCP_BEARER_TOKEN;
  if (!bearer) {
    return {
      ok: false,
      code: 2,
      message:
        args.target === "prod"
          ? "MCP_BEARER_TOKEN is not set. --target prod requires the prod token — run `direnv allow` in the repo root."
          : "MCP_BEARER_TOKEN is not set. Run `direnv allow` in the repo root and re-open the shell.",
    };
  }
  const url = env.MCP_SERVER_URL ?? TARGET_URLS[args.target];
  return {
    ok: true,
    config: {
      name: args.name,
      target: args.target,
      url,
      bearer,
      reset: args.reset,
      yes: args.yes,
    },
  };
}
