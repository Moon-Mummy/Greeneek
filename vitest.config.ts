import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/dist/**", "**/*.test.ts", "**/plugins/**", "plugins/**"],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
