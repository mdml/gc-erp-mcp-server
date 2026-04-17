import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Seed data tables (pure declarative arrays).
        "src/seed/data/**",
        // CLI entry — argv parsing + dispatch to tested seeders.
        "src/seed/run.ts",
        // Thin drizzle client factory — one-line wrapper over drizzle(d1).
        "src/client.ts",
        // Re-export barrels.
        "src/index.ts",
        "src/schema/index.ts",
        "src/ids/index.ts",
        "src/invariants/index.ts",
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
