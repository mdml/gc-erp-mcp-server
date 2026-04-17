/**
 * Pure assertion helpers for the scenario runner.
 *
 * Kept tiny and framework-free so scenarios read like demo scripts rather
 * than vitest suites. Failures throw `ScenarioAssertionError` — the runner
 * catches it, prints the label + diff, and exits non-zero.
 *
 * JSON-stringify equality is deliberate: scenarios compare
 * MCP-over-the-wire payloads, which are already plain JSON. Avoiding
 * `node:assert.deepStrictEqual` keeps the dev-tools bundle Bun-first and
 * the output deterministic (single-line diffs, no node internals).
 */

export class ScenarioAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioAssertionError";
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new ScenarioAssertionError(
      `${label}\n  expected: ${e}\n  actual:   ${a}`,
    );
  }
}

export function assertTrue(condition: boolean, label: string): void {
  if (!condition) throw new ScenarioAssertionError(label);
}

/**
 * Convenience for checking that an MCP response has the expected shape
 * without writing out the full JSON. Returns the narrowed value so callers
 * can chain.
 */
export function assertHasKey<K extends string>(
  obj: unknown,
  key: K,
  label: string,
): asserts obj is Record<K, unknown> {
  if (!obj || typeof obj !== "object" || !(key in obj)) {
    throw new ScenarioAssertionError(
      `${label}: expected object with key "${key}", got ${JSON.stringify(obj)}`,
    );
  }
}
