import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Synapse AI Chat Database Schema
 *
 * Tables:
 * - users: Authenticated users linked to Clerk
 * - sessions: Conversation sessions with auto-close after 6 hours
 * - messages: Chat messages with streaming support and analytics
 */
export default defineSchema({
  // ===========================================================================
  // Users
  // ===========================================================================
  /**
   * Users - linked to Clerk via tokenIdentifier.
   * Created automatically on first authentication.
   */
  users: defineTable({
    /** Clerk token identifier (unique per user) */
    tokenIdentifier: v.string(),
    /** Display name (from Clerk profile or user-set) */
    name: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  // ===========================================================================
  // Sessions
  // ===========================================================================
  /**
   * Sessions - logical groupings of messages within the infinite thread.
   *
   * Lifecycle:
   * - active: User can send messages
   * - processing: AI is generating a response (currently unused)
   * - closed: Session ended (auto-close after 6h or manual)
   *
   * Auto-close triggers Cortex ingest to persist learnings to knowledge graph.
   */
  sessions: defineTable({
    /** Owner of this session */
    userId: v.id("users"),
    /** Current lifecycle status */
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
    /** Compiled user knowledge from Cortex (injected into system prompt) */
    cachedUserKnowledge: v.optional(v.string()),
    /** Session creation timestamp */
    startedAt: v.number(),
    /** Session close timestamp (set when status -> closed) */
    endedAt: v.optional(v.number()),
    /** Last message timestamp (used for staleness detection) */
    lastMessageAt: v.number(),
    /** Scheduled auto-close job ID (for cancellation on activity) */
    closerJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  // ===========================================================================
  // Messages
  // ===========================================================================
  /**
   * Messages - individual chat messages in a session.
   *
   * Supports:
   * - User messages (role: "user")
   * - AI responses (role: "assistant") with streaming
   * - Error states (type: "error") for failed generations
   * - Analytics metadata (tokens, latency, cost)
   */
  messages: defineTable({
    /** Parent session */
    sessionId: v.id("sessions"),
    /** Author role */
    role: v.union(v.literal("user"), v.literal("assistant")),
    /** Message content (updated during streaming for assistant) */
    content: v.string(),
    /** Content type (error = generation failed) */
    type: v.union(v.literal("text"), v.literal("error")),
    /** Completion timestamp (undefined = still streaming) */
    completedAt: v.optional(v.number()),
    /** Generation analytics (assistant messages only) */
    metadata: v.optional(
      v.object({
        /** LLM model identifier */
        model: v.optional(v.string()),
        /** Input tokens consumed */
        promptTokens: v.optional(v.number()),
        /** Output tokens generated */
        completionTokens: v.optional(v.number()),
        /** Total tokens (prompt + completion) */
        totalTokens: v.optional(v.number()),
        /** Cost in USD */
        cost: v.optional(v.number()),
        /** End-to-end generation time (ms) */
        latencyMs: v.optional(v.number()),
        /** LLM finish reason (stop, length, etc.) */
        finishReason: v.optional(v.string()),
        /** Internal error message (for debugging) */
        error: v.optional(v.string()),
        /** Error category code */
        errorCode: v.optional(v.string()),
      })
    ),
  }).index("by_session", ["sessionId"]),
});
