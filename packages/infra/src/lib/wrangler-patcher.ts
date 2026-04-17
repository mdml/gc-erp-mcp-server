/**
 * JSONC-safe wrangler.jsonc patcher.
 *
 * Uses `jsonc-parser`'s text-edit model to modify wrangler.jsonc in-place
 * without touching comments, indentation, or unrelated keys. Never regex-edit
 * or JSON.parse/stringify the file — that would silently drop comments.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyEdits, modify } from "jsonc-parser";

const DEFAULT_WRANGLER_JSONC = fileURLToPath(
  new URL("../../../mcp-server/wrangler.jsonc", import.meta.url),
);

export interface WranglerPatch {
  path: (string | number)[];
  value: unknown;
}

export function patchWranglerJsonc(
  patches: WranglerPatch[],
  filePath = DEFAULT_WRANGLER_JSONC,
): void {
  let content = readFileSync(filePath, "utf8");
  for (const patch of patches) {
    const edits = modify(content, patch.path, patch.value, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    });
    content = applyEdits(content, edits);
  }
  writeFileSync(filePath, content, "utf8");
}
