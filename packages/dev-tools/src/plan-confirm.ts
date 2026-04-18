/**
 * Shared plan+confirm machinery for destructive or prod-touching dogfood
 * scripts (`db:reset:local`, `db:seed:activities:prod`, `db:query:prod`,
 * `scenario --target prod`).
 *
 * Pattern — docs/guides/dogfood.md §Plan+confirm pattern:
 *   1. Render a plan. Always print, even with --yes.
 *   2. If --yes, skip the prompt. Otherwise prompt y/N, default N.
 *   3. Execute only on affirmative confirmation.
 *
 * Pure helpers (`renderPlan`, `parseYesFlag`, `detectDestructiveKeywords`)
 * are the coverage-bearing surface — they're unit-tested in
 * plan-confirm.test.ts. `promptYesNo` is a readline wrapper and is
 * excluded from coverage per the repo's "exclude I/O, test logic" policy
 * (packages/CLAUDE.md §Coverage exclusion policy).
 */

import { createInterface } from "node:readline";

export interface Plan {
  /** Header line — typically the script name, e.g. `"db:reset:local"`. */
  title: string;
  /** Bullet-prefixed action lines rendered under `"This will:"`. */
  actions: string[];
}

export function renderPlan(plan: Plan): string {
  const lines = [plan.title, "", "This will:"];
  for (const a of plan.actions) lines.push(`  • ${a}`);
  lines.push("");
  return lines.join("\n");
}

export function parseYesFlag(argv: readonly string[]): boolean {
  return argv.includes("--yes") || argv.includes("-y");
}

const DESTRUCTIVE_KEYWORDS = [
  "UPDATE",
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
] as const;
export type DestructiveKeyword = (typeof DESTRUCTIVE_KEYWORDS)[number];

/**
 * Heuristic detector for destructive SQL keywords. Not a real parser —
 * operators are writing their own queries and the detector's job is to
 * force an extra confirm step, not to prove the query is safe.
 *
 * Uses case-insensitive word-boundary matches so `updated_at` doesn't trip
 * UPDATE and an `altered_by` column name wouldn't trip ALTER.
 */
export function detectDestructiveKeywords(sql: string): DestructiveKeyword[] {
  const hits: DestructiveKeyword[] = [];
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(sql)) hits.push(kw);
  }
  return hits;
}

/** For consumers that only need a yes/no. */
export function isDestructiveSql(sql: string): boolean {
  return detectDestructiveKeywords(sql).length > 0;
}

/**
 * Print plan, honor `--yes`, otherwise prompt the human. Returns `true`
 * when the caller should proceed.
 */
export async function planAndConfirm(opts: {
  plan: Plan;
  yes: boolean;
  stream?: NodeJS.WritableStream;
}): Promise<boolean> {
  const out = opts.stream ?? process.stdout;
  out.write(renderPlan(opts.plan));
  if (opts.yes) {
    out.write("(--yes: skipping confirmation)\n\n");
    return true;
  }
  return promptYesNo("Proceed?");
}

/**
 * Readline y/N prompt. Default N. Interactive — excluded from coverage
 * via v8 ignore comments below (the harness doesn't have a stdin that
 * would make this testable without a brittle mock).
 */
/* c8 ignore start */
export function promptYesNo(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
/* c8 ignore stop */
