/**
 * Schema barrel. drizzle-kit reads this file (see `drizzle.config.ts`) to
 * generate migrations; `createDatabaseClient` passes the whole module in to
 * give drizzle-orm typed access to every table.
 */

export * from "./activities";
export * from "./commitments";
export * from "./common";
export * from "./costs";
export * from "./documents";
export * from "./ids";
export * from "./jobs";
export * from "./ntp-events";
export * from "./parties";
export * from "./patches";
export * from "./projects";
export * from "./scopes";

import { activities } from "./activities";
import { activations, commitmentScopes, commitments } from "./commitments";
import { costs } from "./costs";
import { documents } from "./documents";
import { jobs } from "./jobs";
import { ntpEvents } from "./ntp-events";
import { parties } from "./parties";
import { patches } from "./patches";
import { projects } from "./projects";
import { scopes } from "./scopes";

/**
 * Flat table registry. Passed into `drizzle(d1, { schema: tables })` so
 * relational queries and introspection work. Add new tables here when they
 * land — `drizzle-kit generate` ignores tables not reachable from this
 * module's exports.
 */
export const tables = {
  activations,
  activities,
  commitments,
  commitmentScopes,
  costs,
  documents,
  jobs,
  ntpEvents,
  parties,
  patches,
  projects,
  scopes,
};
export type Tables = typeof tables;
