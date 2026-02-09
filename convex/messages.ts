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
import { r2 } from "./r2";

// =============================================================================
// Configuration
// =============================================================================

const MAX_MESSAGE_LENGTH = 10_000;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

// =============================================================================
// Public Queries
// =============================================================================

export const list = query({
  args: {
    threadId: v.id("threads"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) return [];

    const requestedLimit = args.limit ?? DEFAULT_MESSAGE_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_MESSAGE_LIMIT);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);

    return messages.reverse(); // chronological order
  },
});

/** Returns a signed R2 URL for an image key. */
export const getImageUrl = query({
  args: {
    key: v.string(),
  },
  handler: async (_ctx, args) => {
    return await r2.getUrl(args.key);
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/** Recent messages for a thread (AI context window, cross-session). */
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

    return messages.reverse();
  },
});

/** All messages for a session (used by Cortex ingest). */
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
 * Send a user message and schedule AI response generation.
 * Validates input, ensures active session (rotates if stale),
 * and creates a placeholder assistant message for streaming.
 */
export const send = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    imageKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const content = args.content.trim();
    const hasImages = args.imageKeys && args.imageKeys.length > 0;

    if (content.length === 0 && !hasImages) {
      throw new Error("Message must have content or images");
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`
      );
    }

    const user = await getOrCreateUser(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    const session = await getOrCreateActiveSession(
      ctx,
      args.threadId,
      user._id
    );

    const userMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "user",
      content,
      type: "text",
      ...(hasImages ? { imageKeys: args.imageKeys } : {}),
    });

    // Empty placeholder — content is streamed in by generateResponse
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "assistant",
      content: "",
      type: "text",
    });

    await touchSession(ctx, session._id);

    await ctx.db.patch(args.threadId, {
      lastMessageAt: Date.now(),
    });

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
      imageCount: args.imageKeys?.length ?? 0,
    });

    return {
      userMessageId,
      assistantMessageId,
      sessionId: session._id,
    };
  },
});

/**
 * Delete a message. Only the thread owner can delete messages.
 * If the deleted message is a user message and the next message is an
 * assistant reply (its pair), the assistant message is also deleted.
 */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify ownership via thread
    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Not authorized to delete this message");
    }

    // If deleting a user message, also remove the paired assistant response
    if (message.role === "user") {
      const nextMessages = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", message.threadId))
        .order("asc")
        .collect();

      const messageIndex = nextMessages.findIndex(
        (m) => m._id === args.messageId
      );

      if (
        messageIndex !== -1 &&
        messageIndex + 1 < nextMessages.length &&
        nextMessages[messageIndex + 1].role === "assistant"
      ) {
        await ctx.db.delete(nextMessages[messageIndex + 1]._id);
      }
    }

    // If deleting an assistant message, also remove the paired user message before it
    if (message.role === "assistant") {
      const allMessages = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", message.threadId))
        .order("asc")
        .collect();

      const messageIndex = allMessages.findIndex(
        (m) => m._id === args.messageId
      );

      if (
        messageIndex > 0 &&
        allMessages[messageIndex - 1].role === "user"
      ) {
        await ctx.db.delete(allMessages[messageIndex - 1]._id);
      }
    }

    await ctx.db.delete(args.messageId);

    console.log("[messages.deleteMessage] Deleted", {
      messageId: args.messageId,
      role: message.role,
      threadId: message.threadId,
    });
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/** Update message content during streaming. Throws if message vanishes mid-stream. */
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

/** Finalize a successful generation with analytics metadata. */
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

/** Mark a message as failed. User sees friendly error; technical details go in metadata. */
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
