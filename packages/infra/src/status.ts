#!/usr/bin/env bun
/**
 * `bun run infra:status` — read-only green/red status for declared resources.
 *
 * Exit 0 if every resource is OK; exit 1 otherwise. Pass `--json` for a
 * machine-readable array (useful for scripting / future gate integrations).
 */

import { infra } from "./infra.config";
import { checkCustomDomain } from "./providers/custom-domain";
import { checkD1 } from "./providers/d1";
import { checkR2 } from "./providers/r2";

export interface StatusRow {
  resource: string;
  state: "ok" | "missing" | "drift" | "error";
  detail?: string;
}

async function customDomainRow(): Promise<StatusRow> {
  const label = `custom-domain ${infra.customDomain.hostname}`;
  try {
    const cd = await checkCustomDomain(infra);
    if (cd.kind === "attached") {
      return {
        resource: label,
        state: "ok",
        detail: `id=${cd.id} service=${cd.service}`,
      };
    }
    if (cd.kind === "missing") {
      return {
        resource: label,
        state: "missing",
        detail: "declared in wrangler.jsonc; run `bun run deploy` to attach",
      };
    }
    return {
      resource: label,
      state: "drift",
      detail: `attached to "${cd.existing.service}" (expected "${cd.expected.service}")`,
    };
  } catch (err) {
    return {
      resource: label,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function d1Row(): Promise<StatusRow> {
  const label = `d1 ${infra.d1.databaseName}`;
  try {
    const d1 = await checkD1(infra);
    if (d1.kind === "exists") {
      return {
        resource: label,
        state: "ok",
        detail: `uuid=${d1.database.uuid}`,
      };
    }
    return {
      resource: label,
      state: "missing",
      detail: "run `bun run infra:apply --yes` to create",
    };
  } catch (err) {
    return {
      resource: label,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function r2Row(): Promise<StatusRow> {
  const label = `r2 ${infra.r2.bucketName}`;
  try {
    const r2 = await checkR2(infra);
    if (r2.kind === "exists") {
      return { resource: label, state: "ok" };
    }
    return {
      resource: label,
      state: "missing",
      detail: "run `bun run infra:apply --yes` to create",
    };
  } catch (err) {
    return {
      resource: label,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function collect(): Promise<StatusRow[]> {
  return Promise.all([customDomainRow(), d1Row(), r2Row()]);
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
