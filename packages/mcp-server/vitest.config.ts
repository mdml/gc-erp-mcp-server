import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Module-load wiring: calls GcErpMcp.serve(...) which only works under
        // workerd. Pure logic (auth, handler) is extracted so this file has no
        // testable branches left.
        "src/index.ts",
      ],
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        "src/**/*.ts": { lines: 60 },
      },
    },
  },
});
