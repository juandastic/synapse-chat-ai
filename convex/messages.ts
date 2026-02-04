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

// =============================================================================
// Configuration
// =============================================================================

/** Maximum allowed message content length (characters) */
const MAX_MESSAGE_LENGTH = 10_000;

/** Default number of messages to return in list query */
const DEFAULT_MESSAGE_LIMIT = 50;

/** Maximum number of messages allowed in list query */
const MAX_MESSAGE_LIMIT = 200;

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
    /** Maximum number of messages to return (default: 50, max: 200) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) return [];

    // Clamp limit to valid range
    const requestedLimit = args.limit ?? DEFAULT_MESSAGE_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_MESSAGE_LIMIT);

    // Fetch sessions sorted by most recent activity first
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (sessions.length === 0) return [];

    // Batch fetch messages from all sessions using Promise.all
    // This avoids the N+1 query problem by parallelizing the fetches
    const messagesBySession = await Promise.all(
      sessions.map((session) =>
        ctx.db
          .query("messages")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect()
      )
    );

    // Flatten, sort by creation time, and return the most recent N messages
    const allMessages = messagesBySession.flat();
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

/**
 * Get all messages for a session (for Synapse Cortex ingest).
 * Returns messages in chronological order.
 */
export const getBySession = internalQuery({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Send a message - the main entry point for the chat.
 *
 * Flow:
 * 1. Validates input content
 * 2. Gets or creates user record (auth required)
 * 3. Gets or creates active session (handles rotation if stale)
 * 4. Inserts user message
 * 5. Creates placeholder assistant message (for streaming)
 * 6. Touches session (resets 6-hour auto-close timer)
 * 7. Schedules AI response generation
 *
 * @returns IDs for the created messages and session
 */
export const send = mutation({
  args: {
    /** Message content from the user */
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Input validation
    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error("Message content cannot be empty");
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`
      );
    }

    // Get or create user (throws if not authenticated)
    const user = await getOrCreateUser(ctx);

    // Get or create active session (handles rotation if stale)
    const session = await getOrCreateActiveSession(ctx, user._id);

    // Insert user message
    const userMessageId = await ctx.db.insert("messages", {
      sessionId: session._id,
      role: "user",
      content,
      type: "text",
    });

    // Create placeholder for streaming assistant response
    const assistantMessageId = await ctx.db.insert("messages", {
      sessionId: session._id,
      role: "assistant",
      content: "",
      type: "text",
    });

    // Update session activity (reschedules auto-close timer)
    await touchSession(ctx, session._id);

    // Schedule AI response generation (executes immediately via runAfter(0))
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      sessionId: session._id,
      assistantMessageId,
    });

    console.log("[messages.send] Message queued for processing", {
      userId: user._id,
      sessionId: session._id,
      userMessageId,
      assistantMessageId,
      contentLength: content.length,
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
 * Update message content during streaming.
 * Called repeatedly by the AI generation action to update the response.
 * High-frequency operation - optimized to minimize overhead.
 */
export const updateContent = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      console.warn("[messages.updateContent] Message not found", {
        messageId: args.id,
      });
      return;
    }

    await ctx.db.patch(args.id, { content: args.content });
  },
});

/**
 * Finalize a successful AI generation.
 * Stores analytics metadata and marks the message as completed.
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
    const message = await ctx.db.get(args.id);
    if (!message) {
      console.error("[messages.saveMetadata] Message not found", {
        messageId: args.id,
      });
      return;
    }

    await ctx.db.patch(args.id, {
      metadata: args.metadata,
      completedAt: args.completedAt,
    });

    console.log("[messages.saveMetadata] Generation completed", {
      messageId: args.id,
      model: args.metadata.model,
      tokens: args.metadata.totalTokens,
      latencyMs: args.metadata.latencyMs,
      finishReason: args.metadata.finishReason,
    });
  },
});

/**
 * Mark a message as failed.
 * Shows user-friendly error content while storing technical details in metadata.
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
    const message = await ctx.db.get(args.id);
    if (!message) {
      console.error("[messages.markAsError] Message not found", {
        messageId: args.id,
      });
      return;
    }

    await ctx.db.patch(args.id, {
      type: "error",
      content: args.errorMessage,
      metadata: args.metadata,
      completedAt: args.completedAt,
    });

    console.error("[messages.markAsError] Generation failed", {
      messageId: args.id,
      sessionId: message.sessionId,
      error: args.metadata?.error,
      errorCode: args.metadata?.errorCode,
      latencyMs: args.metadata?.latencyMs,
    });
  },
});
