import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUser, getOrCreateUser } from "./users";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Slow backoff retry delays indexed by attempt number.
 * Exported for use by the processor action.
 */
export const RETRY_DELAYS_MS = [
  0, //           Attempt 1: immediate
  2 * 60_000, //  Attempt 2: +2 minutes
  10 * 60_000, // Attempt 3: +10 minutes
  30 * 60_000, // Attempt 4: +30 minutes
  30 * 60_000, // Attempt 5: +30 minutes (final)
];

// =============================================================================
// Internal Queries
// =============================================================================

export const get = internalQuery({
  args: { id: v.id("cortex_jobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Enqueue a session ingestion job after a session closes.
 * Called by sessions.autoClose, sessions.forceClose, and stale-session rotation.
 */
export const enqueueIngest = internalMutation({
  args: {
    closedSessionId: v.id("sessions"),
    userId: v.id("users"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Snapshot message stats for debugging/observability (cheap indexed read)
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) =>
        q.eq("sessionId", args.closedSessionId)
      )
      .collect();
    const messageCount = messages.length;
    const totalChars = messages.reduce(
      (sum, m) => sum + m.content.length,
      0
    );

    const jobId = await ctx.db.insert("cortex_jobs", {
      userId: args.userId,
      sessionId: args.closedSessionId,
      type: "ingest",
      payload: {
        closedSessionId: args.closedSessionId,
        userId: args.userId,
        threadId: args.threadId,
        messageCount,
        totalChars,
      },
      status: "pending",
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.cortexProcessor.processJob,
      { jobId }
    );

    console.log("[cortexJobs] Enqueued ingest", {
      jobId,
      sessionId: args.closedSessionId,
      messageCount,
      totalChars,
    });

    return jobId;
  },
});

/**
 * Enqueue a memory correction job.
 * Called by graph.correct after resolving the authenticated user.
 */
export const enqueueCorrection = internalMutation({
  args: {
    userId: v.id("users"),
    correctionText: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const jobId = await ctx.db.insert("cortex_jobs", {
      userId: args.userId,
      type: "correction",
      payload: {
        userId: args.userId,
        correctionText: args.correctionText,
      },
      status: "pending",
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.cortexProcessor.processJob,
      { jobId }
    );

    console.log("[cortexJobs] Enqueued correction", {
      jobId,
      correctionLength: args.correctionText.length,
    });

    return jobId;
  },
});

/**
 * Transition a job's status and metadata.
 * Used exclusively by the processor action.
 */
export const updateStatus = internalMutation({
  args: {
    jobId: v.id("cortex_jobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    attempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    nextRetryAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    const isTerminal =
      args.status === "completed" || args.status === "failed";

    await ctx.db.patch(args.jobId, {
      status: args.status,
      updatedAt: Date.now(),
      ...(args.attempts !== undefined && { attempts: args.attempts }),
      ...(args.lastError !== undefined && { lastError: args.lastError }),
      // Set nextRetryAt if provided, clear it on terminal states
      nextRetryAt: isTerminal ? undefined : args.nextRetryAt,
    });
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Active (non-completed) cortex jobs for the current user.
 * Powers the real-time CortexJobStatus indicator in the Memory Explorer.
 */
export const getActiveByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const [pending, processing, failed] = await Promise.all([
      ctx.db
        .query("cortex_jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "pending")
        )
        .collect(),
      ctx.db
        .query("cortex_jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "processing")
        )
        .collect(),
      ctx.db
        .query("cortex_jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "failed")
        )
        .collect(),
    ]);

    return [...pending, ...processing, ...failed].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/** Manually retry a failed job from the UI. */
export const retryJob = mutation({
  args: { jobId: v.id("cortex_jobs") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== user._id) {
      throw new Error("Job not found");
    }
    if (job.status !== "failed") {
      throw new Error("Only failed jobs can be retried");
    }

    await ctx.db.patch(args.jobId, {
      status: "pending",
      attempts: 0,
      lastError: undefined,
      nextRetryAt: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.cortexProcessor.processJob,
      { jobId: args.jobId }
    );

    console.log("[cortexJobs] Manual retry", {
      jobId: args.jobId,
      type: job.type,
    });
  },
});
