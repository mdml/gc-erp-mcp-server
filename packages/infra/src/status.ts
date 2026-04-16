#!/usr/bin/env bun
/**
 * `bun run infra:status` — read-only green/red status for declared resources.
 *
 * Exit 0 if every resource is OK; exit 1 otherwise. Pass `--json` for a
 * machine-readable array (useful for scripting / future gate integrations).
 */

import { infra } from "./infra.config";
import { checkCustomDomain } from "./providers/custom-domain";

export interface StatusRow {
  resource: string;
  state: "ok" | "missing" | "drift" | "error";
  detail?: string;
}

async function collect(): Promise<StatusRow[]> {
  const rows: StatusRow[] = [];

  try {
    const cd = await checkCustomDomain(infra);
    const label = `custom-domain ${infra.customDomain.hostname}`;
    if (cd.kind === "attached") {
      rows.push({
        resource: label,
        state: "ok",
        detail: `id=${cd.id} service=${cd.service}`,
      });
    } else if (cd.kind === "missing") {
      rows.push({
        resource: label,
        state: "missing",
        detail: "declared in wrangler.jsonc; run `bun run deploy` to attach",
      });
    } else {
      rows.push({
        resource: label,
        state: "drift",
        detail: `attached to "${cd.existing.service}" (expected "${cd.expected.service}")`,
      });
    }
  } catch (err) {
    rows.push({
      resource: `custom-domain ${infra.customDomain.hostname}`,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return rows;
}

function renderText(rows: StatusRow[]): void {
  const maxName = Math.max(...rows.map((r) => r.resource.length));
  console.log("");
  for (const row of rows) {
    const icon = row.state === "ok" ? "\u2713" : "\u2717";
    const label = row.resource.padEnd(maxName + 2);
    const detail = row.detail ? `  ${row.detail}` : "";
    console.log(`  ${icon}  ${label} ${row.state.toUpperCase()}${detail}`);
  }
  console.log("");
}

export async function run(argv: string[]): Promise<number> {
  const rows = await collect();

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ resources: rows }, null, 2));
  } else {
    renderText(rows);
  }

  return rows.every((r) => r.state === "ok") ? 0 : 1;
}

if (import.meta.main) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
