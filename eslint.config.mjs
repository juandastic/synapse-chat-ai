import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import convex from "@convex-dev/eslint-plugin";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.expo/**",
      "**/_generated/**",
      "**/seed/**",
      "**/ios/**",
      "**/android/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,mts,ts,tsx}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Existing API/SDK boundaries use any. TypeScript and focused async rules
      // protect behavior; banning every any would mostly create migration work.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/{app,src}/**/*.{ts,tsx}",
      "packages/backend/convex/**/*.ts",
    ],
    ignores: ["**/*.test.*", "**/test/**"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["apps/mobile/{app,src}/**/*.{ts,tsx}"],
    ignores: ["**/*.test.*", "**/test/**"],
    rules: {
      // React Native Alert callbacks are object properties rather than JSX.
      // As with JSX handlers, async callbacks must handle errors themselves.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false, properties: false } },
      ],
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["packages/backend/convex/**/*.ts"],
    plugins: { "@convex-dev": convex },
    rules: {
      "@convex-dev/require-args-validator": "error",
      "@convex-dev/no-old-registered-function-syntax": "error",
      "@convex-dev/import-wrong-runtime": "error",
    },
  },
);
