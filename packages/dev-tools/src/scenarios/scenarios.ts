/**
 * Scenario registry — name → runner. One entry per scripted walkthrough.
 * Adding a new scenario means writing `foo.ts` next to `kitchen.ts` and
 * registering it here.
 */

import { runKitchen, type ScenarioContext } from "./kitchen";

export type ScenarioRunner = (ctx: ScenarioContext) => Promise<void>;

export const scenarios: Record<string, ScenarioRunner> = {
  kitchen: runKitchen,
};

export function listScenarioNames(): string[] {
  return Object.keys(scenarios).sort();
}
