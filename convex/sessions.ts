import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

// =============================================================================
// Configuration
// =============================================================================

/** Session auto-close threshold: 3 hours of inactivity */
export const SESSION_STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

/** Valid session status values */
export type SessionStatus = "active" | "processing" | "closed";

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
 * Build the combined system prompt from persona, language, and user instructions.
 */
function buildSystemPrompt(
  personaSystemPrompt: string,
  language: string,
  customInstructions?: string
): string {
  let prompt = personaSystemPrompt;

  // Inject language instruction
  prompt += `\n\nIMPORTANT: You MUST respond in ${language}. All your messages should be written in ${language}.`;

  if (customInstructions && customInstructions.trim()) {
    prompt += `\n\n${customInstructions.trim()}`;
  }

  return prompt;
}

/**
 * Get or create an active session for a thread.
 *
 * Session lifecycle:
 * 1. Check for existing active session in the thread
 * 2. If stale (> 3 hours since last message), close it and schedule Cortex ingest
 * 3. Build snapshot: combine persona prompt + user instructions
 * 4. Inherit knowledge from previous session or leave undefined
 * 5. Schedule background hydrate to fetch latest knowledge from Cortex
 *
 * @param ctx - Mutation context
 * @param threadId - Thread to get/create session for
 * @param userId - User ID (for session ownership)
 * @returns Active session document
 */
export async function getOrCreateActiveSession(
  ctx: MutationCtx,
  threadId: Id<"threads">,
  userId: Id<"users">
): Promise<Doc<"sessions">> {
  const now = Date.now();

  // Check for existing active session in this thread
  const existingSession = await ctx.db
    .query("sessions")
    .withIndex("by_thread_status", (q) =>
      q.eq("threadId", threadId).eq("status", "active")
    )
    .first();

  if (existingSession) {
    const inactiveMs = now - existingSession.lastMessageAt;
    const isStale = inactiveMs > SESSION_STALE_THRESHOLD_MS;

    if (!isStale) {
      return existingSession;
    }

    // Close stale session
    const inactiveHours =
      Math.round((inactiveMs / (60 * 60 * 1000)) * 10) / 10;
    console.log("[sessions.getOrCreateActiveSession] Closing stale session", {
      sessionId: existingSession._id,
      threadId,
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

    // Schedule Cortex ingest for the closed session
    await ctx.scheduler.runAfter(0, internal.cortex.ingestAndCreateDraft, {
      closedSessionId: existingSession._id,
      userId,
      threadId,
    });
  }

  // Build snapshot for new session
  const thread = await ctx.db.get(threadId);
  if (!thread) {
    throw new Error("Thread not found");
  }

  const persona = await ctx.db.get(thread.personaId);
  if (!persona) {
    throw new Error("Persona not found for thread");
  }

  const user = await ctx.db.get(userId);
  const cachedSystemPrompt = buildSystemPrompt(
    persona.systemPrompt,
    persona.language,
    user?.customInstructions
  );

  // Inherit knowledge from the most recent closed session in this thread
  // (or undefined if this is the first session)
  let cachedUserKnowledge: string | undefined;
  if (existingSession?.cachedUserKnowledge) {
    cachedUserKnowledge = existingSession.cachedUserKnowledge;
  }

  // Create new session with snapshot
  const sessionId = await ctx.db.insert("sessions", {
    userId,
    threadId,
    status: "active",
    cachedSystemPrompt,
    cachedUserKnowledge,
    startedAt: now,
    lastMessageAt: now,
  });

  // Schedule background hydrate to fetch latest knowledge from Cortex
  // This is async -- the session is immediately usable
  await ctx.scheduler.runAfter(0, internal.cortex.hydrate, {
    userId,
    sessionId,
  });

  const newSession = await ctx.db.get(sessionId);
  if (!newSession) {
    throw new Error("Session creation failed unexpectedly");
  }

  console.log("[sessions.getOrCreateActiveSession] Created new session", {
    sessionId,
    threadId,
    userId,
    hadPreviousSession: !!existingSession,
    hasInheritedKnowledge: !!cachedUserKnowledge,
  });

  return newSession;
}

/**
 * Update session activity timestamp and reschedule auto-close.
 *
 * Implements debounced auto-close: each message resets the 3-hour inactivity
 * timer by canceling the previous scheduled job and creating a new one.
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

  const now = Date.now();
  await ctx.db.patch(sessionId, {
    lastMessageAt: now,
    closerJobId,
  });

  console.log("[sessions.touchSession] Rescheduled auto-close", {
    sessionId,
    closerJobId,
    scheduledForMs: SESSION_STALE_THRESHOLD_MS,
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
      threadId: session.threadId,
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
      threadId: session.threadId,
    });
  },
});

/**
 * Create a draft session pre-loaded with user knowledge from Cortex.
 * Called by cortex.ingestAndCreateDraft after successful graph ingest.
 *
 * Race condition handling: If user starts a new session while Cortex is
 * processing, we update the existing session's knowledge instead of
 * creating a duplicate.
 */
export const createDraftSession = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.id("threads"),
    knowledge: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    // Check for race condition: user may have started chatting already
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_thread_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "active")
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
          threadId: args.threadId,
          userId: args.userId,
          knowledgeLength: args.knowledge.length,
        });
      } else {
        console.log(
          "[sessions.createDraftSession] Session exists, no knowledge update",
          {
            sessionId: existingSession._id,
            threadId: args.threadId,
            userId: args.userId,
          }
        );
      }
      return existingSession._id;
    }

    // Build system prompt from persona + user instructions
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      console.error("[sessions.createDraftSession] Thread not found", {
        threadId: args.threadId,
      });
      return;
    }

    const persona = await ctx.db.get(thread.personaId);
    if (!persona) {
      console.error("[sessions.createDraftSession] Persona not found", {
        personaId: thread.personaId,
      });
      return;
    }

    const user = await ctx.db.get(args.userId);
    const cachedSystemPrompt = buildSystemPrompt(
      persona.systemPrompt,
      persona.language,
      user?.customInstructions
    );

    // Create new draft session
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      threadId: args.threadId,
      status: "active",
      cachedSystemPrompt,
      cachedUserKnowledge: args.knowledge ?? undefined,
      startedAt: now,
      lastMessageAt: now,
    });

    console.log("[sessions.createDraftSession] Created draft session", {
      sessionId,
      threadId: args.threadId,
      userId: args.userId,
      hasKnowledge: !!args.knowledge,
      knowledgeLength: args.knowledge?.length ?? 0,
    });

    return sessionId;
  },
});

/**
 * Valid status transitions for the session state machine.
 * Prevents invalid jumps (e.g., closed -> active).
 */
const VALID_STATUS_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  active: ["processing", "closed"],
  processing: ["active", "closed"],
  closed: [], // Terminal state - no transitions out
};

/**
 * Update session status with state machine validation.
 * Used for transitioning between active/processing/closed states.
 * Rejects invalid transitions (e.g., closed -> active).
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

    // Validate state transition
    const allowedTargets = VALID_STATUS_TRANSITIONS[previousStatus];
    if (!allowedTargets.includes(args.status)) {
      console.error("[sessions.updateStatus] Invalid status transition", {
        sessionId: args.sessionId,
        from: previousStatus,
        to: args.status,
        allowed: allowedTargets,
      });
      throw new Error(
        `Invalid session status transition: ${previousStatus} -> ${args.status}`
      );
    }

    await ctx.db.patch(args.sessionId, { status: args.status });

    console.log("[sessions.updateStatus] Status changed", {
      sessionId: args.sessionId,
      from: previousStatus,
      to: args.status,
    });
  },
});

/**
 * Patch a session's cachedUserKnowledge.
 * Called by cortex.hydrate after fetching knowledge from Cortex /hydrate endpoint.
 */
export const patchKnowledge = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    knowledge: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn("[sessions.patchKnowledge] Session not found", {
        sessionId: args.sessionId,
      });
      return;
    }

    await ctx.db.patch(args.sessionId, {
      cachedUserKnowledge: args.knowledge,
    });

    console.log("[sessions.patchKnowledge] Patched knowledge", {
      sessionId: args.sessionId,
      knowledgeLength: args.knowledge.length,
    });
  },
});
