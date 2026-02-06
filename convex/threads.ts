import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getCurrentUser, getOrCreateUser } from "./users";

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
 * Joins with personas table to include icon and name for sidebar display.
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

    // Batch-join with personas for sidebar display (deduplicate persona IDs)
    const uniquePersonaIds = [
      ...new Set(threads.map((t) => t.personaId)),
    ];
    const personaMap = new Map(
      await Promise.all(
        uniquePersonaIds.map(async (id) => {
          const persona = await ctx.db.get(id);
          return [id, persona] as const;
        })
      )
    );

    const threadsWithPersona = threads.map((thread) => {
      const persona = personaMap.get(thread.personaId);
      if (!persona) {
        console.warn("[threads.list] Persona missing for thread", {
          threadId: thread._id,
          personaId: thread.personaId,
        });
      }
      return {
        ...thread,
        persona: persona
          ? { name: persona.name, icon: persona.icon }
          : { name: "Unknown", icon: "❓" },
      };
    });

    // Sort by most recent activity
    return [...threadsWithPersona].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );
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

    return {
      ...thread,
      persona: persona
        ? { name: persona.name, icon: persona.icon, description: persona.description }
        : { name: "Unknown", icon: "❓", description: undefined },
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
  },
});
