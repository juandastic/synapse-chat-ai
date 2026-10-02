module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    "^@synapse/backend/chatModels$":
      "<rootDir>/../../packages/backend/convex/chatModels.ts",
    "^@synapse/backend/api$":
      "<rootDir>/../../packages/backend/convex/_generated/api.js",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/test/**",
  ],
  coverageDirectory: "../../coverage/mobile",
  coverageReporters: ["text", "html", "lcov"],
};
