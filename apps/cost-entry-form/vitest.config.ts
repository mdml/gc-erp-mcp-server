import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Runtime bootstrap: constructs `App` + `PostMessageTransport`, wires
        // handlers to DOM, registers the Save click listener. Host-envelope
        // territory — not testable in vitest; exercised via real-host
        // dogfood. Pure logic lives in form.ts.
        "src/main.ts",
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
