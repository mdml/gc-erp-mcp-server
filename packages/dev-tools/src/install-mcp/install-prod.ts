#!/usr/bin/env bun
/**
 * CLI for `bun run install:mcp:prod`. Prints connection instructions for
 * the deployed Worker and exits — never writes a file and never
 * interpolates `$MCP_BEARER_TOKEN` into the output.
 *
 * Two options surfaced, Claude.ai (mobile + web) first since that's the
 * primary prod dogfood path. Claude Desktop on Mac is Option 2.
 *
 * Rationale: prod credentials shouldn't be written to an on-disk config
 * by an automated script (docs/guides/dogfood.md §install:mcp:prod).
 *
 * Excluded from coverage — the rendered guide is a pure function tested
 * in patch.test.ts (`renderProdConnectionGuide`).
 */

import { renderProdConnectionGuide } from "./patch";

async function main(): Promise<number> {
  process.stdout.write(renderProdConnectionGuide());
  return 0;
}

process.exit(await main());
