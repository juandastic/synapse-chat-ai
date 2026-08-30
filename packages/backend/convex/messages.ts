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
import { checkDailyUsage } from "./usageLimits";
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

/** Recent messages for a session (AI context window). Previous sessions are already ingested into Cortex. */
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

    return messages.reverse();
  },
});

/** All messages for a session in chronological order. */
export const getBySession = internalQuery({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
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
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const user = await getOrCreateUser(ctx);

    // Usage limit check — blocks before any DB writes
    const usageCheck = await checkDailyUsage(ctx, user);
    if (!usageCheck.allowed) {
      // PostHog: track usage limit hit
      await ctx.scheduler.runAfter(0, internal.analytics.capture, {
        distinctId: user._id,
        event: "usage limit reached",
        properties: {
          plan: user.plan ?? "free",
          reason: usageCheck.reason,
        },
      });
      throw new Error(usageCheck.reason);
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    const session = await getOrCreateActiveSession(ctx, thread, user);
    const promptMode = session.promptMode ?? "legacy";

    const userMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "user",
      content,
      type: "text",
      ...(hasImages ? { imageKeys: args.imageKeys } : {}),
    });

    // Empty placeholder — content is streamed in by the HTTP /chat endpoint
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      sessionId: session._id,
      role: "assistant",
      content: "",
      type: "text",
    });

    await touchSession(ctx, session);

    console.log("[messages.send] Message created — awaiting HTTP stream", {
      userId: user._id,
      threadId: args.threadId,
      sessionId: session._id,
      userMessageId,
      assistantMessageId,
      contentLength: content.length,
      imageCount: args.imageKeys?.length ?? 0,
      promptMode,
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
      const nextMessage = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) =>
          q
            .eq("threadId", message.threadId)
            .gt("_creationTime", message._creationTime),
        )
        .order("asc")
        .first();

      if (nextMessage?.role === "assistant") {
        await ctx.db.delete(nextMessage._id);
      }
    }

    // If deleting an assistant message, also remove the paired user message before it
    if (message.role === "assistant") {
      const previousMessage = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) =>
          q
            .eq("threadId", message.threadId)
            .lt("_creationTime", message._creationTime),
        )
        .order("desc")
        .first();

      if (previousMessage?.role === "user") {
        await ctx.db.delete(previousMessage._id);
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

/**
 * Report a client-side stream failure. Marks the assistant message as error
 * so the UI stops showing "generating" and displays a retry-friendly message.
 * Only the thread owner can call this.
 */
export const reportStreamFailure = mutation({
  args: {
    messageId: v.id("messages"),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Not authorized to report failure for this message");
    }

    if (message.role !== "assistant") {
      throw new Error("Can only report failure for assistant messages");
    }

    // Don't overwrite a message the server already finalized
    if (message.completedAt !== undefined) {
      console.log(
        "[messages.reportStreamFailure] Skipped — already finalized",
        {
          messageId: args.messageId,
        },
      );
      return;
    }

    const errorContent =
      args.errorMessage ??
      "I'm having trouble responding right now. Please try again.";

    await ctx.db.patch(args.messageId, {
      type: "error",
      content: errorContent,
      metadata: { errorCode: "CLIENT_STREAM_FAILURE" },
      completedAt: Date.now(),
    });

    console.log("[messages.reportStreamFailure] Marked as failed", {
      messageId: args.messageId,
      threadId: message.threadId,
    });
  },
});

/**
 * Re-generate the assistant response for a given user message.
 * If a paired assistant message exists (and is not currently streaming),
 * it is deleted first. A fresh placeholder is created so the client can
 * kick off a new streaming request.
 */
export const resend = mutation({
  args: {
    userMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    // Usage limit check — blocks before creating new assistant placeholder
    const usageCheck = await checkDailyUsage(ctx, user);
    if (!usageCheck.allowed) {
      // PostHog: track usage limit hit on resend
      await ctx.scheduler.runAfter(0, internal.analytics.capture, {
        distinctId: user._id,
        event: "usage limit reached",
        properties: {
          plan: user.plan ?? "free",
          reason: usageCheck.reason,
          action: "resend",
        },
      });
      throw new Error(usageCheck.reason);
    }

    const userMessage = await ctx.db.get(args.userMessageId);
    if (!userMessage) {
      throw new Error("Message not found");
    }
    if (userMessage.role !== "user") {
      throw new Error("Can only resend user messages");
    }

    const thread = await ctx.db.get(userMessage.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Not authorized");
    }

    const session = await ctx.db.get(userMessage.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    if (!session.promptSnapshot && session.cachedSystemPrompt === undefined) {
      throw new Error("Session prompt configuration is missing");
    }

    const promptMode = session.promptMode ?? "legacy";

    const nextMessage = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q
          .eq("threadId", userMessage.threadId)
          .gt("_creationTime", userMessage._creationTime),
      )
      .order("asc")
      .first();

    if (nextMessage && nextMessage.role === "assistant") {
      if (nextMessage.completedAt === undefined) {
        throw new Error("Cannot retry while the response is still generating");
      }
      await ctx.db.delete(nextMessage._id);
    }

    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: userMessage.threadId,
      sessionId: userMessage.sessionId,
      role: "assistant",
      content: "",
      type: "text",
    });

    if (session.status === "closed") {
      await ctx.db.patch(userMessage.threadId, { lastMessageAt: Date.now() });
    } else {
      await touchSession(ctx, session);
    }

    console.log("[messages.resend] Re-generating response", {
      userMessageId: args.userMessageId,
      deletedPreviousId:
        nextMessage?.role === "assistant" ? nextMessage._id : null,
      assistantMessageId,
      threadId: userMessage.threadId,
      promptMode,
    });

    return {
      assistantMessageId,
      sessionId: userMessage.sessionId,
    };
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Persist partial content during generation.
 * Called as a safety checkpoint when the client disconnects mid-stream,
 * so progress is not lost if the runtime is terminated.
 */
export const updateStreamingContent = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message || message.completedAt !== undefined) return;
    await ctx.db.patch(args.id, { content: args.content });
  },
});

/**
 * Persist final content + metadata in a single atomic write.
 * Called by the HTTP streaming endpoint when generation completes (or on tab close).
 */
export const finalizeGeneration = internalMutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
    metadata: v.object({
      model: v.optional(v.string()),
      promptTokens: v.optional(v.number()),
      completionTokens: v.optional(v.number()),
      totalTokens: v.optional(v.number()),
      thoughtsTokens: v.optional(v.number()),
      cachedTokens: v.optional(v.number()),
      ragEnabled: v.optional(v.boolean()),
      ragNodes: v.optional(v.number()),
      ragEdges: v.optional(v.number()),
      ragSearchMs: v.optional(v.number()),
      ragContextChars: v.optional(v.number()),
      groundingEnabled: v.optional(v.boolean()),
      groundingUsed: v.optional(v.boolean()),
      groundingQueryCount: v.optional(v.number()),
      groundingSourceCount: v.optional(v.number()),
      groundingSupportCount: v.optional(v.number()),
      groundingSearchEntryPoint: v.optional(v.string()),
      groundingSources: v.optional(
        v.array(
          v.object({
            title: v.string(),
            uri: v.string(),
          }),
        ),
      ),
      cost: v.optional(v.number()),
      latencyMs: v.optional(v.number()),
      finishReason: v.optional(v.string()),
      usedFallback: v.optional(v.boolean()),
    }),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      console.log("[messages.finalizeGeneration] Message was deleted", {
        messageId: args.id,
      });
      return;
    }

    await ctx.db.patch(args.id, {
      type: "text",
      content: args.content,
      metadata: args.metadata,
      completedAt: args.completedAt,
    });

    console.log("[messages.finalizeGeneration] Generation persisted", {
      messageId: args.id,
      contentLength: args.content.length,
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
      }),
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
