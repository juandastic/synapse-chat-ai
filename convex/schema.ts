import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// =============================================================================
// Database Schema
// =============================================================================

export default defineSchema({
  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------
  /**
   * Users table - linked to Clerk via tokenIdentifier.
   * Created automatically on first authentication.
   */
  users: defineTable({
    /** Clerk token identifier for authentication */
    tokenIdentifier: v.string(),
    /** Display name (from Clerk or user-set) */
    name: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------
  /**
   * Sessions table - logical groupings of messages within the infinite thread.
   * Sessions auto-close after 6 hours of inactivity to manage context windows.
   */
  sessions: defineTable({
    /** Reference to the user who owns this session */
    userId: v.id("users"),
    /** Session lifecycle status */
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
    /** Cached user knowledge snapshot for this session (from AI Brain, mocked for now) */
    cachedUserKnowledge: v.string(),
    /** Timestamp when session was created */
    startedAt: v.number(),
    /** Timestamp when session was closed (if closed) */
    endedAt: v.optional(v.number()),
    /** Timestamp of last message activity (for staleness detection) */
    lastMessageAt: v.number(),
    /** Reference to scheduled auto-close job (for debouncing) */
    closerJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  /**
   * Messages table - individual chat messages.
   * Both user and assistant messages are stored here.
   * Assistant messages include generation metadata for analytics.
   */
  messages: defineTable({
    /** Reference to the session this message belongs to */
    sessionId: v.id("sessions"),
    /** Message author role */
    role: v.union(v.literal("user"), v.literal("assistant")),
    /** Message content (streamed for assistant messages) */
    content: v.string(),
    /** Message type (text or error) */
    type: v.union(v.literal("text"), v.literal("error")),
    /** Timestamp when AI response completed (success or error). Undefined = still processing */
    completedAt: v.optional(v.number()),
    /** Generation metadata (assistant messages only, for analytics) */
    metadata: v.optional(
      v.object({
        /** LLM model used (e.g., "openai/gpt-oss-120b:free") */
        model: v.optional(v.string()),
        /** Input tokens consumed */
        promptTokens: v.optional(v.number()),
        /** Output tokens generated */
        completionTokens: v.optional(v.number()),
        /** Total tokens (prompt + completion) */
        totalTokens: v.optional(v.number()),
        /** Cost in USD (from OpenRouter) */
        cost: v.optional(v.number()),
        /** Generation time in milliseconds */
        latencyMs: v.optional(v.number()),
        /** Finish reason (stop, length, etc.) */
        finishReason: v.optional(v.string()),
        /** Error message (internal, for debugging) */
        error: v.optional(v.string()),
        /** Error code (e.g., API error code) */
        errorCode: v.optional(v.string()),
      })
    ),
  }).index("by_session", ["sessionId"]),
});
