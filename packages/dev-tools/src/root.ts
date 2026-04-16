import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch {
        // fall through
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate workspace root (no package.json with 'workspaces' found walking up from ${startDir})`,
  );
}

export const REPO_ROOT = findWorkspaceRoot();
