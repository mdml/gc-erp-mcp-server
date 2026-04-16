#!/usr/bin/env bun
/**
 * gate — thin CLI entry.
 *
 *   bun run gate                 # lint + typecheck + test + code health
 *   bun run gate -- --coverage   # as above, but test:coverage enforces thresholds
 *   bun run gate -- --summary    # only show output for failing checks
 */

import { runGate } from "./gate/runner";

const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const summary = args.includes("--summary");

const passed = await runGate(summary, coverage);
if (!passed) {
  process.exit(1);
}
