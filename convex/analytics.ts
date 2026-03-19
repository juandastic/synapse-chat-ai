"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { PostHog } from "posthog-node";

// =============================================================================
// PostHog Client
// =============================================================================

/**
 * Create a short-lived PostHog client for serverless/action contexts.
 * flushAt=1 and flushInterval=0 ensure events are sent immediately.
 */
function createPostHogClient(): PostHog {
  return new PostHog(process.env.POSTHOG_KEY!, {
    host: process.env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
}

// =============================================================================
// Internal Actions
// =============================================================================

/**
 * Capture a PostHog event from a Convex mutation.
 * Schedule with ctx.scheduler.runAfter(0, internal.analytics.capture, {...}).
 */
export const capture = internalAction({
  args: {
    distinctId: v.string(),
    event: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const posthog = createPostHogClient();
    console.log("[analytics capture] called", {
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties ?? {},
    });
    try {
      await posthog.captureImmediate({
        distinctId: args.distinctId,
        event: args.event,
        properties: args.properties ?? {},
      });
    } finally {
      await posthog.shutdown();
    }
  },
});

/**
 * Identify a user in PostHog and update their person profile.
 * Schedule with ctx.scheduler.runAfter(0, internal.analytics.identify, {...}).
 */
export const identify = internalAction({
  args: {
    distinctId: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const posthog = createPostHogClient();
    console.log("[analytics identify] called", {
      distinctId: args.distinctId,
      properties: args.properties ?? {},
    });
    try {
      await posthog.identifyImmediate({
        distinctId: args.distinctId,
        properties: args.properties ?? {},
      });
    } finally {
      await posthog.shutdown();
    }
  },
});

/**
 * Capture an exception in PostHog from a Convex mutation.
 * Schedule with ctx.scheduler.runAfter(0, internal.analytics.captureException, {...}).
 */
export const captureException = internalAction({
  args: {
    distinctId: v.string(),
    errorMessage: v.string(),
    additionalProperties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const posthog = createPostHogClient();
    console.log("[analytics captureException] called", {
      distinctId: args.distinctId,
      errorMessage: args.errorMessage,
      additionalProperties: args.additionalProperties ?? {},
    });
    try {
      posthog.captureException(
        new Error(args.errorMessage),
        args.distinctId,
        args.additionalProperties ?? {}
      );
    } finally {
      await posthog.shutdown();
    }
  },
});
