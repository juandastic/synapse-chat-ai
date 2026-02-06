import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getOrCreateUser, getCurrentUser } from "./users";
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
 * List messages for a thread.
 * Returns messages sorted by creation time, most recent at the end.
 * Uses the by_thread index for efficient single-query fetching.
 */
export const list = query({
  args: {
    /** Thread to list messages for */
    threadId: v.id("threads"),
    /** Maximum number of messages to return (default: 50, max: 200) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify authentication and thread ownership
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) return [];

    // Clamp limit to valid range
    const requestedLimit = args.limit ?? DEFAULT_MESSAGE_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_MESSAGE_LIMIT);

    // Fetch messages for this thread using the by_thread index
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);

    // Return in chronological order (oldest first)
    return messages.reverse();
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get recent messages for a thread (for AI context window).
 * Returns messages in chronological order across all sessions.
 */
export const getRecent = internalQuery({
  args: {
    threadId: v.id("threads"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
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
 * 3. Verifies thread ownership
 * 4. Gets or creates active session (handles rotation if stale)
 * 5. Inserts user message with threadId + sessionId
 * 6. Creates placeholder assistant message (for streaming)
 * 7. Touches session (resets 3-hour auto-close timer)
 * 8. Updates thread.lastMessageAt
 * 9. Schedules AI response generation
 *
 * @returns IDs for the created messages and session
 */
export const send = mutation({
  args: {
    /** Thread to send the message in */
    threadId: v.id("threads"),
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

    // Verify thread ownership
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    // Get or create active session (handles rotation if stale)
    const session = await getOrCreateActiveSession(
      ctx,
      args.threadId,
      user._id
    );

    // Insert user message
    const userMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "user",
      content,
      type: "text",
    });

    // Create placeholder for streaming assistant response
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "assistant",
      content: "",
      type: "text",
    });

    // Update session activity (reschedules auto-close timer)
    await touchSession(ctx, session._id);

    // Update thread's last activity timestamp
    await ctx.db.patch(args.threadId, {
      lastMessageAt: Date.now(),
    });

    // Schedule AI response generation (executes immediately via runAfter(0))
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      sessionId: session._id,
      threadId: args.threadId,
      assistantMessageId,
    });

    console.log("[messages.send] Message queued for processing", {
      userId: user._id,
      threadId: args.threadId,
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
 *
 * Throws if the message is missing, since a disappeared message mid-stream
 * indicates a data integrity issue that the caller should handle.
 */
export const updateContent = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      console.error("[messages.updateContent] Message not found mid-stream", {
        messageId: args.id,
      });
      throw new Error(`Message ${args.id} not found during streaming update`);
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
      error: args.metadata?.error,
      errorCode: args.metadata?.errorCode,
      latencyMs: args.metadata?.latencyMs,
    });
  },
});
