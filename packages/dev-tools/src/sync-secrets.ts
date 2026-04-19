#!/usr/bin/env bun
/**
 * sync-secrets — pull secrets from 1Password → /.envrc.enc + packages/mcp-server/.dev.vars
 *
 * Two categories (see secrets.config.ts):
 *   - Team secrets: fetched via project-baked op refs; hard-fail on any missing value.
 *   - Developer secrets: refs live in /.env.op.local (gitignored, per-developer).
 *     Missing file / entry / op-read failure → warn-and-skip in sync-secrets
 *     itself. Downstream consumers decide independently whether the secret is
 *     required (e.g. the Code Health gate hard-fails without CS_ACCESS_TOKEN).
 *
 * I/O primitives (age, op, subprocess, atomic writes) live in ./io.
 *
 * Prereqs:
 *   - `op` (1Password CLI) installed and signed in.
 *   - age key present at ~/.config/sops/age/keys.txt (or $SOPS_AGE_KEY_FILE).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ageEncrypt,
  ageKeyPath,
  checkOp,
  die,
  type OpReadResult,
  opRead,
  readAgePublicKey,
  resolveWorkspaceRoot,
  shellQuote,
  writeAtomic,
} from "./io";
import {
  type DeveloperSecret,
  developerSecrets,
  localDevVars,
  type SecretTarget,
  type TeamSecret,
  teamSecrets,
} from "./secrets.config";

const MCP_SERVER_REL = "packages/mcp-server";
const ENV_OP_LOCAL_FILENAME = ".env.op.local";
const ENV_OP_LOCAL_EXAMPLE = ".env.op.local.example";

// Re-export so tests and callers don't need to know which module owns the type.
export type { OpReadResult };

/**
 * Parse a `.env.op.local` file body into a `{ NAME: opRef }` map.
 * Blanks, comments, and malformed lines are ignored. Values are trimmed;
 * an empty value still appears in the map so callers can distinguish
 * "present but blank" from "missing entirely" via `name in map`.
 */
export function parseEnvOpLocal(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    result[key] = line.slice(eq + 1).trim();
  }
  return result;
}

/**
 * Decide whether to attempt an `op read` for a developer secret, given the
 * (possibly absent) parsed `.env.op.local`. Pure — keeps the skip/fetch
 * decision testable without shelling out to `op`.
 */
export type DeveloperFetchPlan =
  | { kind: "fetch"; opRef: string }
  | { kind: "skip"; reason: string };

export function planDeveloperFetch(
  spec: DeveloperSecret,
  opLocal: Record<string, string> | null,
): DeveloperFetchPlan {
  if (opLocal === null) {
    return {
      kind: "skip",
      reason: `${ENV_OP_LOCAL_FILENAME} not found — copy ${ENV_OP_LOCAL_EXAMPLE} to get started`,
    };
  }
  const raw = opLocal[spec.name];
  if (raw === undefined || raw === "") {
    return {
      kind: "skip",
      reason: `no ref in ${ENV_OP_LOCAL_FILENAME} for ${spec.name}`,
    };
  }
  return { kind: "fetch", opRef: raw };
}

export type FetchVerdict =
  | { kind: "ok"; name: string; value: string }
  | { kind: "skip"; name: string; reason: string }
  | { kind: "fatal"; name: string; reason: string };

function failureVerdict(
  name: string,
  opRef: string,
  onFail: "fatal" | "skip",
  stderr: string,
): FetchVerdict {
  return {
    kind: onFail,
    name,
    reason: `op read failed for ${opRef}\n  ${stderr}`,
  };
}

/** Team secrets: an `op read` failure is fatal. */
export function classifyTeamFetch(
  spec: TeamSecret,
  result: OpReadResult,
): FetchVerdict {
  if (result.ok) return { kind: "ok", name: spec.name, value: result.value };
  return failureVerdict(spec.name, spec.opRef, "fatal", result.stderr);
}

/** Developer secrets: an `op read` failure degrades to skip. */
export function classifyDeveloperFetch(
  spec: DeveloperSecret,
  opRef: string,
  result: OpReadResult,
): FetchVerdict {
  if (result.ok) return { kind: "ok", name: spec.name, value: result.value };
  return failureVerdict(spec.name, opRef, "skip", result.stderr);
}

function loadEnvOpLocal(root: string): Record<string, string> | null {
  const path = join(root, ENV_OP_LOCAL_FILENAME);
  if (!existsSync(path)) return null;
  return parseEnvOpLocal(readFileSync(path, "utf8"));
}

interface ResolvedSecret {
  name: string;
  value: string;
  targets: SecretTarget[];
}

interface Skipped {
  name: string;
  reason: string;
}

async function syncTeam(): Promise<ResolvedSecret[]> {
  console.log(
    `sync-secrets: pulling ${teamSecrets.length} team secret(s) from 1Password…`,
  );
  const team: ResolvedSecret[] = [];
  for (const spec of teamSecrets) {
    process.stdout.write(`  • ${spec.name} ← ${spec.opRef}\n`);
    const verdict = classifyTeamFetch(spec, await opRead(spec.opRef));
    if (verdict.kind !== "ok") die(verdict.reason);
    team.push({ name: spec.name, value: verdict.value, targets: spec.targets });
  }
  return team;
}

async function syncDeveloperOne(
  spec: DeveloperSecret,
  opLocal: Record<string, string> | null,
): Promise<{ resolved?: ResolvedSecret; skipped?: Skipped }> {
  const plan = planDeveloperFetch(spec, opLocal);
  if (plan.kind === "skip") {
    console.error(`  • ${spec.name}: skipped (${plan.reason})`);
    return { skipped: { name: spec.name, reason: plan.reason } };
  }
  process.stdout.write(`  • ${spec.name} ← ${plan.opRef}\n`);
  const verdict = classifyDeveloperFetch(
    spec,
    plan.opRef,
    await opRead(plan.opRef),
  );
  if (verdict.kind !== "ok") {
    const reason =
      verdict.kind === "skip"
        ? verdict.reason
        : `unexpected fatal on ${spec.name}: ${verdict.reason}`;
    console.error(`    skipped: ${reason}`);
    return { skipped: { name: spec.name, reason } };
  }
  return {
    resolved: {
      name: spec.name,
      value: verdict.value,
      targets: spec.targets,
    },
  };
}

async function syncDeveloper(
  root: string,
): Promise<{ developer: ResolvedSecret[]; skipped: Skipped[] }> {
  const developer: ResolvedSecret[] = [];
  const skipped: Skipped[] = [];
  const opLocal = loadEnvOpLocal(root);
  console.log();
  console.log(
    `sync-secrets: resolving ${developerSecrets.length} developer secret(s) from ${ENV_OP_LOCAL_FILENAME}…`,
  );
  for (const spec of developerSecrets) {
    const { resolved, skipped: skip } = await syncDeveloperOne(spec, opLocal);
    if (resolved) developer.push(resolved);
    if (skip) skipped.push(skip);
  }
  return { developer, skipped };
}

/**
 * Build the `.dev.vars` body from resolved secrets + literal local values.
 * Literals override resolved values of the same name — local stays local.
 * Pure helper extracted from `writeArtifacts` so it's directly testable.
 */
export function buildDevVarsBody(
  resolved: ResolvedSecret[],
  literals: Record<string, string>,
): { body: string; names: string[] } {
  const merged = new Map<string, string>();
  for (const s of resolved) {
    if (s.targets.includes("dev-vars")) merged.set(s.name, s.value);
  }
  for (const [name, value] of Object.entries(literals)) {
    merged.set(name, value);
  }
  const names = Array.from(merged.keys());
  const body = `${names.map((n) => `${n}=${merged.get(n)}`).join("\n")}\n`;
  return { body, names };
}

async function writeArtifacts(
  root: string,
  pubkey: string,
  resolved: ResolvedSecret[],
): Promise<{ envrcNames: string[]; devVarsNames: string[] }> {
  const envrc = resolved.filter((s) => s.targets.includes("envrc"));

  const envrcBody = `${envrc
    .map((s) => `${s.name}=${shellQuote(s.value)}`)
    .join("\n")}\n`;
  const encrypted = await ageEncrypt(envrcBody, pubkey);
  writeAtomic(join(root, ".envrc.enc"), encrypted);

  const { body: devVarsBody, names: devVarsNames } = buildDevVarsBody(
    resolved,
    localDevVars,
  );
  writeAtomic(join(root, MCP_SERVER_REL, ".dev.vars"), devVarsBody);

  return {
    envrcNames: envrc.map((s) => s.name),
    devVarsNames,
  };
}

interface SyncSummary {
  team: ResolvedSecret[];
  developer: ResolvedSecret[];
  skipped: Skipped[];
  envrcNames: string[];
  devVarsNames: string[];
  pubkey: string;
  keyPath: string;
}

function printSummary(s: SyncSummary): void {
  console.log();
  console.log(
    `  wrote team:      ${s.team.map((x) => x.name).join(", ") || "(none)"}`,
  );
  console.log(
    `  wrote developer: ${s.developer.map((x) => x.name).join(", ") || "(none)"}`,
  );
  if (s.skipped.length > 0) {
    console.log(
      `  skipped:         ${s.skipped.map((x) => x.name).join(", ")}`,
    );
  }
  console.log();
  console.log(
    `  /.envrc.enc                      ← ${s.envrcNames.join(", ")}`,
  );
  console.log(
    `  /${MCP_SERVER_REL}/.dev.vars  ← ${s.devVarsNames.join(", ") || "(none)"}`,
  );
  console.log();
  console.log(`age recipient: ${s.pubkey}`);
  console.log(`age key:       ${s.keyPath}`);
  console.log();
  console.log("next: direnv reload   (then: turbo run deploy)");
}

async function main() {
  const root = resolveWorkspaceRoot();
  const keyPath = ageKeyPath();
  const pubkey = readAgePublicKey(keyPath);

  await checkOp();

  const team = await syncTeam();
  const { developer, skipped } = await syncDeveloper(root);
  const { envrcNames, devVarsNames } = await writeArtifacts(root, pubkey, [
    ...team,
    ...developer,
  ]);
  printSummary({
    team,
    developer,
    skipped,
    envrcNames,
    devVarsNames,
    pubkey,
    keyPath,
  });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("sync-secrets: unexpected error");
    console.error(err);
    process.exit(1);
  });
}
