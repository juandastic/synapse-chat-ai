import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getOrCreateUser } from "./users";
import { getOrCreateActiveSession, touchSession } from "./sessions";
import { Doc } from "./_generated/dataModel";

// =============================================================================
// Public Queries
// =============================================================================

/**
 * List messages for the current user's conversation.
 * Returns messages across all sessions (infinite thread experience).
 * Messages are sorted by creation time, most recent at the end.
 */
export const list = query({
  args: {
    /** Maximum number of messages to return (default: 50) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return [];

    const limit = args.limit ?? 50;

    // Get all user's sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Collect messages from all sessions
    const allMessages: Doc<"messages">[] = [];
    for (const session of sessions) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      allMessages.push(...messages);
    }

    // Sort by creation time and return the most recent N messages
    allMessages.sort((a, b) => a._creationTime - b._creationTime);
    return allMessages.slice(-limit);
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get recent messages for a session (for AI context window).
 * Returns messages in chronological order.
 */
export const getRecent = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit);

    // Return in chronological order
    return messages.reverse();
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Send a message - the main entry point for the chat.
 *
 * This mutation:
 * 1. Gets or creates the user record
 * 2. Gets or creates an active session (handles rotation if stale)
 * 3. Inserts the user message
 * 4. Creates a placeholder assistant message
 * 5. Touches the session (resets auto-close timer)
 * 6. Schedules the AI response generation
 *
 * @returns IDs for the created messages and session
 */
export const send = mutation({
  args: {
    /** Message content from the user */
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get or create user
    const user = await getOrCreateUser(ctx);

    // 2. Get or create active session (handles rotation)
    const session = await getOrCreateActiveSession(ctx, user._id);

    // 3. Insert user message
    const userMessageId = await ctx.db.insert("messages", {
      sessionId: session._id,
      role: "user",
      content: args.content,
      type: "text",
    });

    // 4. Create placeholder assistant message
    const assistantMessageId = await ctx.db.insert("messages", {
      sessionId: session._id,
      role: "assistant",
      content: "",
      type: "text",
    });

    // 5. Touch session (updates lastMessageAt, reschedules auto-close)
    await touchSession(ctx, session._id);

    // 6. Schedule AI response generation (runs immediately)
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      sessionId: session._id,
      assistantMessageId,
    });

    console.log("[messages] Message sent", {
      sessionId: session._id,
      userMessageId,
      assistantMessageId,
    });

    return {
      userMessageId,
      assistantMessageId,
      sessionId: session._id,
    };
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Update message content (for streaming responses).
 * Called repeatedly during AI generation to update the message.
 */
export const updateContent = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { content: args.content });
  },
});

/**
 * Save message metadata after generation completes successfully.
 * Stores analytics data like tokens used, latency, and cost.
 * Also marks the message as completed by setting completedAt.
 */
export const saveMetadata = internalMutation({
  args: {
    id: v.id("messages"),
    metadata: v.object({
      model: v.optional(v.string()),
      promptTokens: v.optional(v.number()),
      completionTokens: v.optional(v.number()),
      totalTokens: v.optional(v.number()),
      cost: v.optional(v.number()),
      latencyMs: v.optional(v.number()),
      finishReason: v.optional(v.string()),
    }),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      metadata: args.metadata,
      completedAt: args.completedAt,
    });
  },
});

/**
 * Mark a message as an error.
 * Called when AI generation fails to show error to user.
 * Stores error details in metadata for debugging while showing user-friendly content.
 */
export const markAsError = internalMutation({
  args: {
    id: v.id("messages"),
    errorMessage: v.string(),
    metadata: v.optional(
      v.object({
        error: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        latencyMs: v.optional(v.number()),
      })
    ),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      type: "error",
      content: args.errorMessage,
      metadata: args.metadata,
      completedAt: args.completedAt,
    });
  },
});
