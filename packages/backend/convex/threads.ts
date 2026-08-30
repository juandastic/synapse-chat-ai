import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUser, getOrCreateUser } from "./users";
import { isDemoUser } from "./demo";

// =============================================================================
// Configuration
// =============================================================================

/** Maximum length for thread title */
const MAX_TITLE_LENGTH = 200;

// =============================================================================
// Public Queries
// =============================================================================

/**
 * List all threads for the authenticated user, sorted by lastMessageAt desc.
 *
 * Returns raw thread documents — no persona join. The frontend performs the
 * join in-memory using personas.list (already subscribed), saving N persona
 * reads per query evaluation.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Sort by most recent activity
    return [...threads].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );
  },
});

/**
 * Return the 3 most recent threads (raw, no persona join).
 * Currently unused — frontend derives from threads.list instead.
 * Kept as a lightweight alternative if needed in the future.
 */
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return [...threads]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 3);
  },
});

/**
 * Get a single thread by ID with ownership check.
 * Includes persona data for the header display.
 */
export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) return null;

    const persona = await ctx.db.get(thread.personaId);
    if (!persona) {
      console.warn("[threads.get] Persona missing for thread", {
        threadId: args.threadId,
        personaId: thread.personaId,
      });
    }

    let promptMode =
      thread.activePromptMode ?? user.preferredPromptMode ?? ("legacy" as const);
    let canChangePromptMode =
      thread.activePromptModeLockedAt === undefined;

    // Compatibility for threads created before the lightweight mirror existed.
    // New and touched sessions use the fields on the thread and skip this read.
    if (thread.activeSessionId === undefined) {
      const activeSession = await ctx.db
        .query("sessions")
        .withIndex("by_thread_status", (q) =>
          q.eq("threadId", thread._id).eq("status", "active")
        )
        .first();

      if (activeSession) {
        promptMode = activeSession.promptSnapshot
          ? activeSession.promptMode ?? "legacy"
          : "legacy";
        canChangePromptMode = activeSession.promptModeLockedAt === undefined;

        if (canChangePromptMode) {
          const firstMessage = await ctx.db
            .query("messages")
            .withIndex("by_session", (q) =>
              q.eq("sessionId", activeSession._id)
            )
            .first();
          canChangePromptMode = firstMessage === null;
        }
      }
    }

    return {
      ...thread,
      persona: persona
        ? { name: persona.name, icon: persona.icon, description: persona.description }
        : { name: "Unknown", icon: "❓", description: undefined },
      promptState: {
        promptMode,
        canChangePromptMode,
      },
    };
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Create a new thread linked to a persona.
 * Auto-generates title as "{PersonaName} - {Date}".
 * Returns the new threadId for immediate navigation.
 */
export const create = mutation({
  args: {
    personaId: v.id("personas"),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    // Validate persona ownership
    const persona = await ctx.db.get(args.personaId);
    if (!persona || persona.userId !== user._id) {
      throw new Error("Persona not found");
    }

    // Generate title: "{PersonaName} - {FormattedDate}"
    // Use explicit locale and UTC timezone to ensure consistent titles across environments
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const title = `${persona.name} - ${dateStr}`;

    const now = Date.now();
    const threadId = await ctx.db.insert("threads", {
      userId: user._id,
      personaId: args.personaId,
      title,
      lastMessageAt: now,
    });

    console.log("[threads.create] Created thread", {
      threadId,
      userId: user._id,
      personaId: args.personaId,
      title,
    });

    // PostHog: track new thread creation
    await ctx.scheduler.runAfter(0, internal.analytics.capture, {
      distinctId: user._id,
      event: "thread created",
      properties: {
        persona_id: args.personaId,
        persona_name: persona.name,
      },
    });

    return threadId;
  },
});

/**
 * Update thread title. Ownership check enforced.
 */
export const updateTitle = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    const title = args.title.trim();
    if (title.length === 0) {
      throw new Error("Title cannot be empty");
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title cannot exceed ${MAX_TITLE_LENGTH} characters`);
    }

    await ctx.db.patch(args.threadId, { title });

    console.log("[threads.updateTitle] Updated title", {
      threadId: args.threadId,
      userId: user._id,
      title,
    });
  },
});

/**
 * Delete a thread and cascade-delete all sessions and messages.
 */
export const remove = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    if (isDemoUser(user)) {
      throw new Error("Cannot delete threads in demo mode");
    }

    // Cascade delete: messages first, then sessions, then thread
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_thread_status", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const session of sessions) {
      // Cancel any pending auto-close jobs
      if (session.closerJobId) {
        await ctx.scheduler.cancel(session.closerJobId);
      }
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(args.threadId);

    console.log("[threads.remove] Deleted thread with cascade", {
      threadId: args.threadId,
      userId: user._id,
      messagesDeleted: messages.length,
      sessionsDeleted: sessions.length,
    });

    // PostHog: track thread deletion
    await ctx.scheduler.runAfter(0, internal.analytics.capture, {
      distinctId: user._id,
      event: "thread deleted",
      properties: {
        messages_deleted: messages.length,
        sessions_deleted: sessions.length,
      },
    });
  },
});
