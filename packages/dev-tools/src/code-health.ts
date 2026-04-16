#!/usr/bin/env bun
/**
 * code-health — per-file Code Health check for lefthook's pre-commit hook.
 *
 *   bun run code-health <file> [<file>...]
 *
 * Shares parsing logic with gate/runCodeHealthCheck (see gate/checks.ts).
 * Strict — every failure mode blocks:
 *   - no paths passed        → exit 0, "No source files to check"
 *   - `cs` not installed     → exit 1 with install instructions
 *   - CS_ACCESS_TOKEN unset  → exit 1 with ".env.op.local" guidance
 *   - any file unmeasured    → exit 1 (cs ran but no score → auth/connectivity)
 *   - any file score < 10    → exit 1, print failing files + first 5 warnings
 */

import {
  CS_MISSING_MSG,
  checkFileHealth,
  type FileHealth,
  isCsAvailable,
  TOKEN_MISSING_MSG,
  UNMEASURED_MSG,
} from "./gate/checks";

async function main(): Promise<number> {
  const files = process.argv.slice(2);

  if (files.length === 0) {
    console.log("No source files to check");
    return 0;
  }

  if (!(await isCsAvailable())) {
    console.error(CS_MISSING_MSG);
    return 1;
  }

  if (!process.env.CS_ACCESS_TOKEN) {
    console.error(TOKEN_MISSING_MSG);
    return 1;
  }

  const results = await Promise.all(files.map(checkFileHealth));
  const unmeasured = results.filter(
    (r): r is Extract<FileHealth, { kind: "unmeasured" }> =>
      r.kind === "unmeasured",
  );
  const failures = results.filter(
    (r): r is Extract<FileHealth, { kind: "fail" }> => r.kind === "fail",
  );

  if (unmeasured.length > 0) {
    console.error(UNMEASURED_MSG);
    for (const r of unmeasured) console.error(`  \u2022 ${r.file}`);
    return 1;
  }

  if (failures.length === 0) return 0;

  for (const r of failures) console.error(r.message);
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
