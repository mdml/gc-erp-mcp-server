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
        // Thin CLI entry — dispatches to gate/checks pure helpers.
        "src/code-health.ts",
        // Shells out to subprocesses (bunx turbo, cs, git). Excluded rather than
        // mocked — per the repo's coverage policy: exclude orchestrators, test logic.
        // Pure helpers (parseCodeHealthOutput) are tested in checks.test.ts anyway.
        "src/gate/checks.ts",
        // Shells out to op + age; orchestration layer, not logic.
        "src/sync-secrets.ts",
        // Subprocess + file I/O primitives (run, opRead, ageEncrypt, writeAtomic).
        "src/io.ts",
        // Pure declarative data.
        "src/secrets.config.ts",
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
