import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Thin CLI entry — argv parsing only.
        "src/gate.ts",
        // Subprocess orchestrator (bunx turbo). Pure helper getGateChecks
        // is tested directly in checks.test.ts.
        "src/gate/checks.ts",
        // Scenario-runner I/O wiring. Correctness is guarded by Layer-1 tool
        // tests (apps/mcp-server/src/tools/*.test.ts) per ADR 0004
        // §Decision; the runner is a thin transport wrapper that exists to
        // drive `bun run dev` in-process during demos. Pure helpers
        // (assert.ts, args.ts) stay covered.
        "src/scenarios/client.ts",
        "src/scenarios/kitchen.ts",
        "src/scenarios/reset.ts",
        "src/scenarios/reset-cli.ts",
        "src/scenarios/run.ts",
        "src/scenarios/scenarios.ts",
        // Shared wrangler-spawn wrapper — subprocess orchestrator, no logic.
        "src/wrangler.ts",
        // Dogfood-script CLIs — thin dispatchers + wrangler/readline I/O.
        // Pure helpers (plan-confirm, seed-activities-sql, install-mcp/patch)
        // are tested alongside the CLIs they back.
        "src/db/migrate.ts",
        "src/db/query.ts",
        "src/db/reset.ts",
        "src/db/seed-activities.ts",
        "src/install-mcp/install-local.ts",
        "src/install-mcp/install-prod.ts",
      ],
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 90,
        "src/**/*.ts": { lines: 70 },
      },
    },
  },
});
