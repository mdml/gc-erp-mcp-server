#!/usr/bin/env bun
/**
 * Thin CLI entry for `bun run scenario:reset`. Kept separate from
 * `reset.ts` so the pure helper stays importable from the scenario runner
 * without pulling in top-level `await` / `process.exit` side effects.
 */

import { resetLocalD1 } from "./reset";

await resetLocalD1();
console.log("✓ local D1 truncated");
