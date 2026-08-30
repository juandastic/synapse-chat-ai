import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { getOrCreateUser } from "./users";
import {
  createPromptSnapshot,
  PromptSnapshot,
  PromptMode,
  promptModeValidator,
} from "./prompts";

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

function buildPromptSnapshotForPersona(
  persona: Doc<"personas">,
  promptMode: PromptMode,
  customInstructions?: string,
): PromptSnapshot {
  return createPromptSnapshot({
    promptMode,
    legacyPersonaPrompt: persona.systemPrompt,
    structuredRolePrompt: persona.structuredRolePrompt,
    language: persona.language,
    customInstructions,
  });
}

async function createActiveSession(
  ctx: MutationCtx,
  thread: Doc<"threads">,
  user: Doc<"users">,
  promptMode: PromptMode,
): Promise<Doc<"sessions">> {
  const persona = await ctx.db.get(thread.personaId);
  if (!persona) throw new Error("Persona not found for thread");

  const promptSnapshot = buildPromptSnapshotForPersona(
    persona,
    promptMode,
    user.customInstructions,
  );
  const now = Date.now();

  const sessionId = await ctx.db.insert("sessions", {
    userId: user._id,
    threadId: thread._id,
    status: "active",
    promptMode,
    promptSnapshot,
    startedAt: now,
    lastMessageAt: now,
  });

  await ctx.db.patch(thread._id, {
    activeSessionId: sessionId,
    activePromptMode: promptMode,
    activePromptModeLockedAt: undefined,
  });

  await ctx.scheduler.runAfter(0, internal.cortex.hydrate, {
    userId: user._id,
    sessionId,
  });

  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Session creation failed unexpectedly");
  return session;
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
 * @param thread - Already-authorized thread document
 * @param user - Current user document
 * @returns Active session document
 */
export async function getOrCreateActiveSession(
  ctx: MutationCtx,
  thread: Doc<"threads">,
  user: Doc<"users">,
): Promise<Doc<"sessions">> {
  const now = Date.now();

  // Check for existing active session in this thread
  const existingSession = await ctx.db
    .query("sessions")
    .withIndex("by_thread_status", (q) =>
      q.eq("threadId", thread._id).eq("status", "active"),
    )
    .first();

  if (existingSession) {
    const inactiveMs = now - existingSession.lastMessageAt;
    const isStale = inactiveMs > SESSION_STALE_THRESHOLD_MS;

    if (!isStale) {
      if (
        !existingSession.promptSnapshot &&
        existingSession.cachedSystemPrompt === undefined
      ) {
        throw new Error("Session prompt configuration is missing");
      }
      return existingSession;
    }

    // Close stale session
    const inactiveHours = Math.round((inactiveMs / (60 * 60 * 1000)) * 10) / 10;
    console.log("[sessions.getOrCreateActiveSession] Closing stale session", {
      sessionId: existingSession._id,
      threadId: thread._id,
      userId: user._id,
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

    // Enqueue Cortex ingest job for the closed session
    await ctx.runMutation(internal.cortexJobs.enqueueIngest, {
      closedSessionId: existingSession._id,
      userId: user._id,
      threadId: thread._id,
    });
  }

  const promptMode = user.preferredPromptMode ?? "legacy";
  const newSession = await createActiveSession(ctx, thread, user, promptMode);

  console.log("[sessions.getOrCreateActiveSession] Created new session", {
    sessionId: newSession._id,
    threadId: thread._id,
    userId: user._id,
    hadPreviousSession: !!existingSession,
  });

  return newSession;
}

/**
 * Update session activity and ensure one auto-close check is scheduled.
 *
 * The scheduled mutation checks lastMessageAt before closing. If the session
 * received another message, it schedules itself for the remaining idle time.
 */
export async function touchSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  const closerJobId =
    session.closerJobId ??
    (await ctx.scheduler.runAfter(
      SESSION_STALE_THRESHOLD_MS,
      internal.sessions.autoClose,
      { sessionId: session._id },
    ));

  const now = Date.now();
  await ctx.db.patch(session._id, {
    lastMessageAt: now,
    closerJobId,
    promptModeLockedAt: session.promptModeLockedAt ?? now,
  });

  await ctx.db.patch(session.threadId, {
    lastMessageAt: now,
    activeSessionId: session._id,
    activePromptMode: session.promptSnapshot
      ? (session.promptMode ?? "legacy")
      : "legacy",
    activePromptModeLockedAt: session.promptModeLockedAt ?? now,
  });

  console.log("[sessions.touchSession] Activity recorded", {
    sessionId: session._id,
    closerJobId,
    scheduledNewCloser: session.closerJobId === undefined,
  });
}

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Auto-close a session after inactivity timeout.
 * Triggered by scheduler after SESSION_STALE_THRESHOLD_MS of no messages.
 * Enqueues a Cortex ingest job to persist the conversation to the knowledge graph.
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

    const now = Date.now();
    const remainingIdleMs =
      SESSION_STALE_THRESHOLD_MS - (now - session.lastMessageAt);

    if (remainingIdleMs > 0) {
      const closerJobId = await ctx.scheduler.runAfter(
        remainingIdleMs,
        internal.sessions.autoClose,
        { sessionId: args.sessionId },
      );
      await ctx.db.patch(args.sessionId, { closerJobId });
      console.log("[sessions.autoClose] Session still active, rescheduled", {
        sessionId: args.sessionId,
        remainingIdleMs,
      });
      return;
    }

    const sessionDurationMs = now - session.startedAt;
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
      endedAt: now,
      closerJobId: undefined,
    });
    await ctx.db.patch(session.threadId, {
      activeSessionId: undefined,
      activePromptMode: undefined,
      activePromptModeLockedAt: undefined,
    });

    // Enqueue Cortex ingest job to persist learnings and prepare next session
    await ctx.runMutation(internal.cortexJobs.enqueueIngest, {
      closedSessionId: args.sessionId,
      userId: session.userId,
      threadId: session.threadId,
    });
  },
});

/**
 * Create a draft session for a thread after ingest completes.
 * Called by cortexProcessor after a successful (or fallback) ingest.
 *
 * Knowledge is now read from user_memory table — sessions no longer store it.
 *
 * Race condition handling: if the user already started a new session
 * while Cortex was processing, we skip (no-op).
 */
export const createDraftSession = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    // Check for race condition: user may have started chatting already
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_thread_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "active"),
      )
      .first();

    if (existingSession) {
      console.log(
        "[sessions.createDraftSession] Session already exists, skipping",
        {
          sessionId: existingSession._id,
          threadId: args.threadId,
          userId: args.userId,
        },
      );
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
    const promptMode = user?.preferredPromptMode ?? "legacy";
    const promptSnapshot = buildPromptSnapshotForPersona(
      persona,
      promptMode,
      user?.customInstructions,
    );

    // Create new draft session — knowledge is read from user_memory at query time
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      threadId: args.threadId,
      status: "active",
      promptMode,
      promptSnapshot,
      startedAt: now,
      lastMessageAt: now,
    });
    await ctx.db.patch(args.threadId, {
      activeSessionId: sessionId,
      activePromptMode: promptMode,
      activePromptModeLockedAt: undefined,
    });

    console.log("[sessions.createDraftSession] Created draft session", {
      sessionId,
      threadId: args.threadId,
      userId: args.userId,
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
      v.literal("closed"),
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
        `Invalid session status transition: ${previousStatus} -> ${args.status}`,
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

// =============================================================================
// Public Mutations
// =============================================================================

/** Select the personality mode for a new, still-empty session. */
export const setPromptModeForEmptySession = mutation({
  args: {
    threadId: v.id("threads"),
    promptMode: promptModeValidator,
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    const activeSession = await ctx.db
      .query("sessions")
      .withIndex("by_thread_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "active"),
      )
      .first();

    if (!activeSession) {
      await ctx.db.patch(user._id, { preferredPromptMode: args.promptMode });
      const newSession = await createActiveSession(
        ctx,
        thread,
        user,
        args.promptMode,
      );
      return {
        promptMode: args.promptMode,
        sessionId: newSession._id,
      };
    }

    const currentMode: PromptMode = activeSession.promptSnapshot
      ? (activeSession.promptMode ?? "legacy")
      : "legacy";
    if (currentMode === args.promptMode) {
      return {
        promptMode: args.promptMode,
        sessionId: activeSession._id,
      };
    }

    const firstMessage = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", activeSession._id))
      .first();

    if (activeSession.promptModeLockedAt !== undefined || firstMessage) {
      throw new Error(
        "Personality can only be changed before the first message of a new session",
      );
    }

    await ctx.db.patch(user._id, { preferredPromptMode: args.promptMode });
    const persona = await ctx.db.get(thread.personaId);
    if (!persona) throw new Error("Persona not found for thread");
    const promptSnapshot = buildPromptSnapshotForPersona(
      persona,
      args.promptMode,
      user.customInstructions,
    );
    await ctx.db.patch(activeSession._id, {
      promptMode: args.promptMode,
      promptSnapshot,
      cachedSystemPrompt: undefined,
    });
    await ctx.db.patch(args.threadId, {
      activeSessionId: activeSession._id,
      activePromptMode: args.promptMode,
      activePromptModeLockedAt: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.analytics.capture, {
      distinctId: user._id,
      event: "prompt mode switched",
      properties: {
        thread_id: args.threadId,
        session_id: activeSession._id,
        previous_prompt_mode: currentMode,
        prompt_mode: args.promptMode,
      },
    });

    return {
      promptMode: args.promptMode,
      sessionId: activeSession._id,
    };
  },
});

/**
 * Force-close the active session for a thread and enqueue Cortex ingest.
 *
 * Used by the "Consolidate Memory" button in the chat UI.
 * Closes the current active session (if any) and creates an ingest job
 * so that the conversation is persisted to the knowledge graph.
 *
 * @returns { success: boolean, message: string }
 */
export const forceClose = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    // Verify thread ownership
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    // Find active session
    const activeSession = await ctx.db
      .query("sessions")
      .withIndex("by_thread_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "active"),
      )
      .first();

    if (!activeSession) {
      return { success: false, message: "No active session to close" };
    }

    // The UI disables consolidation while streaming, but keep the mutation
    // safe against stale clients and direct calls. Reading only the newest
    // message uses the existing by_session index and avoids collecting the
    // session history.
    const latestMessage = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", activeSession._id))
      .order("desc")
      .first();

    if (
      latestMessage?.role === "assistant" &&
      latestMessage.completedAt === undefined
    ) {
      return {
        success: false,
        message: "Wait for the response to finish before consolidating memory",
      };
    }

    // Cancel pending auto-close job
    if (activeSession.closerJobId) {
      await ctx.scheduler.cancel(activeSession.closerJobId);
    }

    // Close the session
    await ctx.db.patch(activeSession._id, {
      status: "closed",
      endedAt: Date.now(),
      closerJobId: undefined,
    });
    await ctx.db.patch(args.threadId, {
      activeSessionId: undefined,
      activePromptMode: undefined,
      activePromptModeLockedAt: undefined,
    });

    const ingestEnqueued = latestMessage !== null;

    if (ingestEnqueued) {
      await ctx.runMutation(internal.cortexJobs.enqueueIngest, {
        closedSessionId: activeSession._id,
        userId: user._id,
        threadId: args.threadId,
      });
    }

    console.log("[sessions.forceClose] Session force-closed", {
      sessionId: activeSession._id,
      userId: user._id,
      threadId: args.threadId,
      ingestEnqueued,
    });

    if (ingestEnqueued) {
      // PostHog: track manual memory consolidation
      await ctx.scheduler.runAfter(0, internal.analytics.capture, {
        distinctId: user._id,
        event: "memory consolidated",
        properties: {
          thread_id: args.threadId,
          session_id: activeSession._id,
        },
      });
    }

    return {
      success: true,
      message: ingestEnqueued
        ? "Memory consolidation started"
        : "Session closed",
      ingestEnqueued,
    };
  },
});
