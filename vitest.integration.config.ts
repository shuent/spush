import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    sequence: {
      concurrent: false,
    },
  },
});
