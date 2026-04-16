/**
 * Sole-boundary invariants.
 *
 * Only `src/lib/cloudflare-client.ts` may call `fetch()`.
 * Only `src/lib/wrangler-adapter.ts` may call `Bun.spawn` (once that adapter lands).
 *
 * This test greps every non-test source file under `src/` and fails if the
 * boundary is breached. It's vacuously true today for `Bun.spawn` — keeping
 * the check in place so the invariant holds the moment wrangler-adapter lands.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const FETCH_BOUNDARY = join("lib", "cloudflare-client.ts");
const SPAWN_BOUNDARY = join("lib", "wrangler-adapter.ts");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkTs(full));
      continue;
    }
    if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

function findOffenders(
  files: string[],
  boundaryFile: string,
  pattern: RegExp,
): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    if (file.endsWith(".test.ts")) continue;
    if (file.endsWith(boundaryFile)) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      if (pattern.test(line)) {
        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    }
  }
  return offenders;
}

describe("sole boundary", () => {
  const files = walkTs(SRC);

  it("fetch() is only called inside lib/cloudflare-client.ts", () => {
    const offenders = findOffenders(files, FETCH_BOUNDARY, /\bfetch\s*\(/);
    expect(offenders).toEqual([]);
  });

  it("Bun.spawn is only called inside lib/wrangler-adapter.ts", () => {
    const offenders = findOffenders(files, SPAWN_BOUNDARY, /\bBun\.spawn\b/);
    expect(offenders).toEqual([]);
  });
});
