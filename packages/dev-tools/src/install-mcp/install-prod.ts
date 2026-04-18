#!/usr/bin/env bun
/**
 * CLI for `bun run install:mcp:prod`. Prints the `gc-erp-prod` config
 * block to stdout and exits — never writes a file and never
 * interpolates `$MCP_BEARER_TOKEN` into the output. The user copies the
 * block, pastes it into their own Claude Desktop / mobile connector
 * config, and substitutes the bearer by hand from 1Password.
 *
 * Rationale: prod credentials shouldn't be written to an on-disk config
 * by an automated script (docs/guides/dogfood.md §install:mcp:prod).
 *
 * Excluded from coverage — the rendered block is a pure function tested
 * in patch.test.ts (`renderProdConfigBlock`).
 */

import { renderProdConfigBlock } from "./patch";

process.stdout.write(renderProdConfigBlock());
process.stdout.write(
  "\nPaste the block above into ~/Library/Application Support/Claude/claude_desktop_config.json " +
    "(alongside any existing `gc-erp-local` entry) and replace the placeholder " +
    "with your MCP_BEARER_TOKEN from 1Password.\n",
);
