import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
    },
  },
});
