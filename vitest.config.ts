import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    pool: "forks",
  },
});
