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
        // Thin test harness: in-memory sqlite factory used by tool tests. No
        // testable branches — swapping it for mocks would defeat the point.
        "src/tools/_test-db.ts",
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
