import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "apps/web/src/**/*.{ts,tsx}",
        "packages/backend/convex/**/*.ts",
      ],
      exclude: [
        "**/*.test.*",
        "**/test/**",
        "**/_generated/**",
        "**/seed/**",
        "**/vite-env.d.ts",
      ],
    },
    projects: [
      {
        test: {
          name: "backend",
          environment: "edge-runtime",
          include: ["packages/backend/tests/**/*.test.ts"],
          clearMocks: true,
          restoreMocks: true,
          setupFiles: ["packages/backend/tests/setup.ts"],
          silent: "passed-only",
        },
      },
      {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
          },
        },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
          setupFiles: ["apps/web/src/test/setup.ts"],
          env: { VITE_CONVEX_URL: "https://test.convex.cloud" },
          clearMocks: true,
          restoreMocks: true,
          silent: "passed-only",
        },
      },
    ],
  },
});
