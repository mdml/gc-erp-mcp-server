#!/usr/bin/env bun

/**
 * CLI entry for `bun run scenario <name> [flags]` — ADR 0004 Layer 2.
 *
 * Typical workflow:
 *
 *   pane A:  bun run dev                         # wrangler dev on :8787
 *   pane B:  bun run scenario kitchen            # runs against local
 *            bun run scenario kitchen --target prod --yes
 *
 * The server URL defaults to `http://localhost:8787/mcp` (or the prod
 * host when `--target prod`); override via `MCP_SERVER_URL` when
 * pointing at a non-default port. The bearer token is always read from
 * `MCP_BEARER_TOKEN` — local value is the fixed string `dev`, prod is
 * the real token from 1Password. Scripts never print it.
 *
 * Flags:
 *   --target <local|prod>   Choose server URL. Default: local.
 *   --yes | -y              Skip the prod confirm prompt (plan still prints).
 *   --reset                 Truncate local D1 before running. Refused with --target prod.
 *   --list                  Print registered scenarios and exit.
 *
 * Exit codes: 0 ok; 1 scenario failed; 2 CLI misuse.
 *
 * Pure logic (argv parsing, target → URL, bearer check) lives in
 * `./args.ts`; this file is I/O wiring and is excluded from coverage.
 */

import { planAndConfirm } from "../plan-confirm";
import { parseArgs, type ResolvedConfig, resolveConfig } from "./args";
import { ScenarioAssertionError } from "./assert";
import { connectMcp } from "./client";
import { resetLocalD1 } from "./reset";
import { listScenarioNames, scenarios } from "./scenarios";

function usage(): string {
  return [
    "usage: bun run scenario <name> [--target local|prod] [--reset] [--yes] [--list]",
    "",
    `scenarios: ${listScenarioNames().join(", ")}`,
    "",
    "env:",
    "  MCP_SERVER_URL     override URL (defaults to the --target host)",
    "  MCP_BEARER_TOKEN   required (loaded by direnv from .envrc.enc)",
  ].join("\n");
}

function formatError(err: unknown): string {
  if (err instanceof ScenarioAssertionError) {
    return `✗ assertion failed: ${err.message}`;
  }
  if (err instanceof Error) return `✗ ${err.name}: ${err.message}`;
  return `✗ ${String(err)}`;
}

async function runScenario(cfg: ResolvedConfig): Promise<number> {
  console.log(`▶ scenario: ${cfg.name}`);
  console.log(`  target: ${cfg.target}`);
  console.log(`  url:    ${cfg.url}`);
  const runner = scenarios[cfg.name];
  if (!runner) {
    // Shouldn't happen — resolveConfig validated against the known list.
    console.error(`no runner registered for scenario: ${cfg.name}`);
    return 1;
  }
  const client = await connectMcp({ url: cfg.url, bearer: cfg.bearer });
  try {
    const tools = await client.listTools();
    console.log(`  tools:  ${tools.map((t) => t.name).join(", ")}`);
    console.log("");
    await runner({ client, state: {}, log: (msg) => console.log(msg) });
    console.log("");
    console.log("✓ scenario completed");
    return 0;
  } catch (err) {
    console.log("");
    console.error(formatError(err));
    return 1;
  } finally {
    await client.close();
  }
}

function handleEarlyExit(args: ReturnType<typeof parseArgs>): number | null {
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.list) {
    console.log(listScenarioNames().join("\n"));
    return 0;
  }
  if (args.reset && args.target === "prod") {
    console.error(
      "--reset is refused with --target prod (would truncate production D1). " +
        "Run the scenario without --reset, or use a local --target.",
    );
    return 2;
  }
  return null;
}

async function confirmProdIfNeeded(cfg: ResolvedConfig): Promise<boolean> {
  if (cfg.target !== "prod") return true;
  return planAndConfirm({
    plan: {
      title: `scenario ${cfg.name} --target prod`,
      actions: [
        `run scenario against ${cfg.url}`,
        "this will create real data in the live D1 database",
        "idempotent? no — each run mints new IDs and inserts fresh rows",
      ],
    },
    yes: cfg.yes,
  });
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(usage());
    return 2;
  }

  const early = handleEarlyExit(args);
  if (early !== null) return early;

  const resolved = resolveConfig(args, process.env, listScenarioNames());
  if (!resolved.ok) {
    console.error(resolved.message);
    console.error(usage());
    return resolved.code;
  }
  const cfg = resolved.config;

  if (!(await confirmProdIfNeeded(cfg))) {
    console.log("aborted.");
    return 0;
  }

  if (cfg.reset) {
    console.log("↻ resetting local D1…");
    await resetLocalD1();
  }
  return runScenario(cfg);
}

process.exit(await main());
