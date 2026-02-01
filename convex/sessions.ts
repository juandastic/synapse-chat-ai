import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser } from "./users";

// =============================================================================
// Configuration
// =============================================================================

/** Session staleness threshold: 6 hours of inactivity triggers auto-close */
const SESSION_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** Mocked user knowledge (will be replaced with real data from AI Brain) */
const MOCKED_USER_KNOWLEDGE = `User Profile Summary:
- New user, building rapport
- Interests and preferences: Unknown yet
- Communication style: To be learned
- Key context: First interactions, establishing trust`;

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get the current active session for the authenticated user.
 * Returns null if no active session exists.
 */
export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .first();
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get a session by ID (internal use only).
 */
export const get = internalQuery({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// =============================================================================
// Session Management Helpers
// =============================================================================

/**
 * Get or create an active session for the user.
 * Handles session rotation if the current session is stale (> 6 hours inactive).
 *
 * @param ctx - Mutation context
 * @param userId - User ID to get/create session for
 * @returns Active session document
 */
export async function getOrCreateActiveSession(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"sessions">> {
  const now = Date.now();

  // Find current active session
  const existingSession = await ctx.db
    .query("sessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .first();

  // Check if session exists and is fresh
  if (existingSession) {
    const isStale = now - existingSession.lastMessageAt > SESSION_STALE_THRESHOLD_MS;

    if (!isStale) {
      return existingSession;
    }

    // Session is stale - close it
    console.log("[sessions] Closing stale session", {
      sessionId: existingSession._id,
      lastMessageAt: new Date(existingSession.lastMessageAt).toISOString(),
    });

    await ctx.db.patch(existingSession._id, {
      status: "closed",
      endedAt: now,
    });

    // Cancel the old auto-close job if it exists
    if (existingSession.closerJobId) {
      await ctx.scheduler.cancel(existingSession.closerJobId);
    }
  }

  // Create new session
  const sessionId = await ctx.db.insert("sessions", {
    userId,
    status: "active",
    cachedUserKnowledge: MOCKED_USER_KNOWLEDGE,
    startedAt: now,
    lastMessageAt: now,
  });

  const newSession = await ctx.db.get(sessionId);
  if (!newSession) {
    throw new Error("Failed to create session");
  }

  console.log("[sessions] New session created", { sessionId: newSession._id, userId });
  return newSession;
}

/**
 * Update session's lastMessageAt and reschedule the auto-close job.
 * Implements the debounce pattern - each message resets the 6-hour timer.
 *
 * @param ctx - Mutation context
 * @param sessionId - Session to touch
 */
export async function touchSession(
  ctx: MutationCtx,
  sessionId: Id<"sessions">
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;

  // Cancel existing auto-close job if any
  if (session.closerJobId) {
    await ctx.scheduler.cancel(session.closerJobId);
  }

  // Schedule new auto-close job for 6 hours from now
  const closerJobId = await ctx.scheduler.runAfter(
    SESSION_STALE_THRESHOLD_MS,
    internal.sessions.autoClose,
    { sessionId }
  );

  // Update session
  await ctx.db.patch(sessionId, {
    lastMessageAt: Date.now(),
    closerJobId,
  });
}

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Auto-close a session after inactivity timeout.
 * Called by the scheduler after 6 hours of no messages.
 */
export const autoClose = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    // Already closed or doesn't exist - nothing to do
    if (!session || session.status === "closed") {
      return;
    }

    console.log("[sessions] Auto-closing inactive session", { sessionId: args.sessionId });

    await ctx.db.patch(args.sessionId, {
      status: "closed",
      endedAt: Date.now(),
      closerJobId: undefined,
    });

    // Note: We don't create a new session here.
    // The next message will create one via getOrCreateActiveSession.
  },
});

/**
 * Update session status (internal use only).
 */
export const updateStatus = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: args.status });
  },
});
