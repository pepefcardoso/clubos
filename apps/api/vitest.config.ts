import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",

      thresholds: {
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },

        "src/modules/charges/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "src/modules/payments/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "src/webhooks/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "src/jobs/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },

      exclude: [
        "node_modules/**",
        "generated/**",
        "prisma/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/index.ts",
        "src/server.ts",
      ],

      include: ["src/**/*.ts"],
    },
  },
});
