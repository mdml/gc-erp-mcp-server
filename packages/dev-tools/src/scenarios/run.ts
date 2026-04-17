#!/usr/bin/env bun

/**
 * CLI entry for `bun run scenario <name>` — ADR 0004 Layer 2.
 *
 * Typical workflow:
 *
 *   pane A:  bun run dev                # wrangler dev serves the MCP on :8787
 *   pane B:  bun run scenario kitchen   # runs the TOOLS.md §6 walkthrough
 *
 * The server URL defaults to `http://localhost:8787/mcp`; override via
 * `MCP_SERVER_URL` when pointing at a non-default wrangler dev port.
 * The bearer token is read from `MCP_BEARER_TOKEN` (exported by direnv
 * from `.envrc.enc`) — no `.dev.vars` parsing.
 *
 * Flags:
 *   --reset   Truncate the local D1 before running; idempotence-safe.
 *   --list    Print the registered scenarios and exit.
 *
 * Exit codes: 0 ok; 1 scenario failed; 2 CLI misuse.
 */

import { ScenarioAssertionError } from "./assert";
import { connectMcp } from "./client";
import { resetLocalD1 } from "./reset";
import { listScenarioNames, scenarios } from "./scenarios";

interface ParsedArgs {
  name: string | null;
  reset: boolean;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = {
    name: null,
    reset: false,
    list: false,
    help: false,
  };
  for (const a of argv) {
    if (a === "--reset") out.reset = true;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("-") && out.name === null) out.name = a;
  }
  return out;
}

function usage(): string {
  return [
    "usage: bun run scenario <name> [--reset] [--list]",
    "",
    `scenarios: ${listScenarioNames().join(", ")}`,
    "",
    "env:",
    "  MCP_SERVER_URL     default http://localhost:8787/mcp",
    "  MCP_BEARER_TOKEN   required (exported by direnv from .envrc.enc)",
  ].join("\n");
}

interface RunConfig {
  runner: (typeof scenarios)[string];
  name: string;
  url: string;
  bearer: string;
  reset: boolean;
}

function resolveConfig(args: ParsedArgs): RunConfig | number {
  if (!args.name) {
    console.error(usage());
    return 2;
  }
  const runner = scenarios[args.name];
  if (!runner) {
    console.error(`unknown scenario: ${args.name}`);
    console.error(usage());
    return 2;
  }
  const bearer = process.env.MCP_BEARER_TOKEN;
  if (!bearer) {
    console.error(
      "MCP_BEARER_TOKEN is not set. Run `direnv allow` in the repo root and re-open the shell.",
    );
    return 2;
  }
  const url = process.env.MCP_SERVER_URL ?? "http://localhost:8787/mcp";
  return { runner, name: args.name, url, bearer, reset: args.reset };
}

function formatError(err: unknown): string {
  if (err instanceof ScenarioAssertionError) {
    return `✗ assertion failed: ${err.message}`;
  }
  if (err instanceof Error) return `✗ ${err.name}: ${err.message}`;
  return `✗ ${String(err)}`;
}

async function runScenario(cfg: RunConfig): Promise<number> {
  console.log(`▶ scenario: ${cfg.name}`);
  console.log(`  url:    ${cfg.url}`);
  const client = await connectMcp({ url: cfg.url, bearer: cfg.bearer });
  try {
    const tools = await client.listTools();
    console.log(`  tools:  ${tools.map((t) => t.name).join(", ")}`);
    console.log("");
    await cfg.runner({ client, state: {}, log: (msg) => console.log(msg) });
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.list) {
    console.log(listScenarioNames().join("\n"));
    return 0;
  }
  const cfg = resolveConfig(args);
  if (typeof cfg === "number") return cfg;
  if (cfg.reset) {
    console.log("↻ resetting local D1…");
    await resetLocalD1();
  }
  return runScenario(cfg);
}

process.exit(await main());
