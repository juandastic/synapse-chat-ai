import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Scheduled Cortex/PostHog actions only run when a test advances the clock.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error(
        "Unexpected network request. Stub the external service in this test.",
      );
    }),
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
