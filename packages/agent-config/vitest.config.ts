import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Thin CLI entry — writes .claude/settings.json to disk.
        "src/install.ts",
        // Thin CLI entry — shells out to bun install / turbo.
        "src/bootstrap.ts",
        // Subprocess + filesystem primitives; orchestration, not logic.
        "src/io.ts",
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
