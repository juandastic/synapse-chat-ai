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

/** Session auto-close threshold: 6 hours of inactivity */
export const SESSION_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** Default user knowledge for new users (before Cortex builds a profile) */
const DEFAULT_USER_KNOWLEDGE = `User Profile Summary:
- New user, building rapport
- Interests and preferences: Unknown yet
- Communication style: To be learned
- Key context: First interactions, establishing trust`;

/** Valid session status values */
export type SessionStatus = "active" | "processing" | "closed";

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get the current active session for the authenticated user.
 * Returns null if not authenticated or no active session exists.
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
 * Get a session by ID.
 * Returns null if not found (caller should handle).
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
 *
 * Session lifecycle:
 * 1. Check for existing active session
 * 2. If stale (> 6 hours since last message), close it and schedule Cortex ingest
 * 3. Create new session with default or inherited knowledge
 *
 * @param ctx - Mutation context
 * @param userId - User ID to get/create session for
 * @returns Active session document
 * @throws Error if session creation fails (should never happen)
 */
export async function getOrCreateActiveSession(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"sessions">> {
  const now = Date.now();

  // Check for existing active session
  const existingSession = await ctx.db
    .query("sessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .first();

  if (existingSession) {
    const inactiveMs = now - existingSession.lastMessageAt;
    const isStale = inactiveMs > SESSION_STALE_THRESHOLD_MS;

    if (!isStale) {
      return existingSession;
    }

    // Close stale session
    const inactiveHours = Math.round(inactiveMs / (60 * 60 * 1000) * 10) / 10;
    console.log("[sessions.getOrCreateActiveSession] Closing stale session", {
      sessionId: existingSession._id,
      userId,
      inactiveHours,
      lastMessageAt: new Date(existingSession.lastMessageAt).toISOString(),
    });

    await ctx.db.patch(existingSession._id, {
      status: "closed",
      endedAt: now,
    });

    // Cancel pending auto-close job
    if (existingSession.closerJobId) {
      await ctx.scheduler.cancel(existingSession.closerJobId);
    }
  }

  // Create new session with default knowledge
  const sessionId = await ctx.db.insert("sessions", {
    userId,
    status: "active",
    cachedUserKnowledge: DEFAULT_USER_KNOWLEDGE,
    startedAt: now,
    lastMessageAt: now,
  });

  const newSession = await ctx.db.get(sessionId);
  if (!newSession) {
    // This should never happen - db.insert succeeded
    throw new Error("Session creation failed unexpectedly");
  }

  console.log("[sessions.getOrCreateActiveSession] Created new session", {
    sessionId,
    userId,
    hadPreviousSession: !!existingSession,
  });

  return newSession;
}

/**
 * Update session activity timestamp and reschedule auto-close.
 *
 * Implements debounced auto-close: each message resets the 6-hour inactivity
 * timer by canceling the previous scheduled job and creating a new one.
 *
 * @param ctx - Mutation context
 * @param sessionId - Session to update
 */
export async function touchSession(
  ctx: MutationCtx,
  sessionId: Id<"sessions">
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) {
    console.warn("[sessions.touchSession] Session not found", { sessionId });
    return;
  }

  // Cancel existing auto-close job to prevent premature closure
  if (session.closerJobId) {
    await ctx.scheduler.cancel(session.closerJobId);
  }

  // Schedule new auto-close job
  const closerJobId = await ctx.scheduler.runAfter(
    SESSION_STALE_THRESHOLD_MS,
    internal.sessions.autoClose,
    { sessionId }
  );

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
 * Triggered by scheduler after SESSION_STALE_THRESHOLD_MS of no messages.
 *
 * Post-close flow:
 * 1. Marks session as closed
 * 2. Schedules Cortex ingest to persist conversation to knowledge graph
 * 3. Cortex creates a draft session with updated user knowledge
 */
export const autoClose = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    // Guard: session already closed or deleted
    if (!session || session.status === "closed") {
      console.log("[sessions.autoClose] Session already closed or missing", {
        sessionId: args.sessionId,
        exists: !!session,
      });
      return;
    }

    const sessionDurationMs = Date.now() - session.startedAt;
    const sessionDurationHours =
      Math.round((sessionDurationMs / (60 * 60 * 1000)) * 10) / 10;

    console.log("[sessions.autoClose] Closing inactive session", {
      sessionId: args.sessionId,
      userId: session.userId,
      sessionDurationHours,
    });

    // Close the session
    await ctx.db.patch(args.sessionId, {
      status: "closed",
      endedAt: Date.now(),
      closerJobId: undefined,
    });

    // Trigger Cortex ingest to persist learnings and prepare next session
    await ctx.scheduler.runAfter(0, internal.cortex.ingestAndCreateDraft, {
      closedSessionId: args.sessionId,
      userId: session.userId,
    });
  },
});

/**
 * Create a draft session pre-loaded with user knowledge from Cortex.
 * Called by cortex.ingestAndCreateDraft after successful graph ingest.
 *
 * Draft session characteristics:
 * - status: "active" (ready for user's next message)
 * - cachedUserKnowledge: compiled knowledge from the graph
 * - No closerJobId (auto-close timer starts on first message)
 *
 * Race condition handling: If user starts a new session while Cortex is
 * processing, we update the existing session's knowledge instead of
 * creating a duplicate.
 */
export const createDraftSession = internalMutation({
  args: {
    userId: v.id("users"),
    knowledge: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    // Check for race condition: user may have started chatting already
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();

    if (existingSession) {
      // Update existing session with new knowledge (if available)
      if (args.knowledge) {
        await ctx.db.patch(existingSession._id, {
          cachedUserKnowledge: args.knowledge,
        });
        console.log("[sessions.createDraftSession] Updated existing session", {
          sessionId: existingSession._id,
          userId: args.userId,
          knowledgeLength: args.knowledge.length,
        });
      } else {
        console.log("[sessions.createDraftSession] Session exists, no knowledge update", {
          sessionId: existingSession._id,
          userId: args.userId,
        });
      }
      return existingSession._id;
    }

    // Create new draft session (no closerJobId = auto-close starts on first message)
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      status: "active",
      cachedUserKnowledge: args.knowledge ?? undefined,
      startedAt: now,
      lastMessageAt: now,
    });

    console.log("[sessions.createDraftSession] Created draft session", {
      sessionId,
      userId: args.userId,
      hasKnowledge: !!args.knowledge,
      knowledgeLength: args.knowledge?.length ?? 0,
    });

    return sessionId;
  },
});

/**
 * Update session status.
 * Used for transitioning between active/processing/closed states.
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
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn("[sessions.updateStatus] Session not found", {
        sessionId: args.sessionId,
      });
      return;
    }

    const previousStatus = session.status;
    await ctx.db.patch(args.sessionId, { status: args.status });

    console.log("[sessions.updateStatus] Status changed", {
      sessionId: args.sessionId,
      from: previousStatus,
      to: args.status,
    });
  },
});
