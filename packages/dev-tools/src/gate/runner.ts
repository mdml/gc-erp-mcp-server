/**
 * Gate orchestration — runs checks and formats output.
 */

import type { CheckResult } from "./checks";
import { runAllChecks } from "./checks";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const NC = "\x1b[0m";

export function extractFailureLines(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => /FAIL|ERROR|failed|error:/i.test(line))
    .slice(0, 30);
}

function formatPassingCheck(r: CheckResult, summary: boolean): string[] {
  const lines = [`--- ${r.name} ---`];
  if (!summary) {
    lines.push(r.output);
  }
  lines.push(`${GREEN}\u2713 ${r.name} passed${NC}`, "");
  return lines;
}

function formatFailingCheck(r: CheckResult, summary: boolean): string[] {
  const lines = [`--- ${r.name} ---`];
  if (summary) {
    lines.push(...extractFailureLines(r.output));
  } else {
    lines.push(r.output);
  }
  lines.push(`${RED}\u2717 ${r.name} failed${NC}`, "");
  return lines;
}

export function formatResults(
  results: CheckResult[],
  summary: boolean,
): string {
  const lines: string[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (r.passed) {
      passCount++;
      lines.push(...formatPassingCheck(r, summary));
    } else {
      failCount++;
      lines.push(...formatFailingCheck(r, summary));
    }
  }

  lines.push("==============================");
  lines.push(
    `${GREEN}Passed: ${passCount}${NC}  ${RED}Failed: ${failCount}${NC}`,
  );
  lines.push("==============================");

  if (failCount === 0) {
    lines.push(`${GREEN}Gate passed.${NC}`);
  }

  return lines.join("\n");
}

export async function runGate(
  summary: boolean,
  coverage = false,
): Promise<boolean> {
  const results = await runAllChecks(coverage);
  const output = formatResults(results, summary);
  console.log(output);
  return results.every((r) => r.passed);
}
