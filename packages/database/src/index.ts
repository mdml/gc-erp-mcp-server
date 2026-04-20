/**
 * Top-level barrel for `@gc-erp/database` consumers (i.e. apps/mcp-server).
 * Re-exports schemas, branded IDs, ID generators, invariants, and the D1
 * client factory. Seed scripts are not re-exported — they're tooling, not
 * runtime.
 */

export * from "./client";
export * from "./ids";
export * from "./invariants";
export { patchIdFor } from "./patches/hash";
export * from "./projections";
export * from "./schema";
