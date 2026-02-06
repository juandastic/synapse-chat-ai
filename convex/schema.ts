import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Synapse AI Chat Database Schema
 *
 * Multi-thread, persona-based architecture:
 * - users: Authenticated users linked to Clerk
 * - personas: Configuration templates (system prompt + identity)
 * - threads: Conversation channels linked to a specific persona
 * - sessions: Atomic execution units within a thread (snapshot prompt + knowledge)
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
    /** Global custom instructions applied to all personas */
    customInstructions: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  // ===========================================================================
  // Personas
  // ===========================================================================
  /**
   * Personas - configuration templates defining AI personality.
   * Each persona has a system prompt, icon, and language preference.
   * Users can create custom personas or use system templates.
   */
  personas: defineTable({
    /** Owner of this persona */
    userId: v.id("users"),
    /** Display name (e.g., "Therapist", "Coding Partner") */
    name: v.string(),
    /** Short description of the persona's purpose */
    description: v.optional(v.string()),
    /** Language preference (e.g., "English", "Espanol") */
    language: v.string(),
    /** Base system prompt instructions */
    systemPrompt: v.string(),
    /** Emoji or URL for visual identification */
    icon: v.string(),
    /** Whether this is the user's default persona */
    isDefault: v.boolean(),
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Threads
  // ===========================================================================
  /**
   * Threads - conversation channels linked to a specific persona.
   * Each thread has an immutable persona link and auto-generated title.
   */
  threads: defineTable({
    /** Owner of this thread */
    userId: v.id("users"),
    /** Immutable link to the persona used for this thread */
    personaId: v.id("personas"),
    /** Thread title (auto-generated, editable later) */
    title: v.string(),
    /** Timestamp of last message activity (for sorting) */
    lastMessageAt: v.number(),
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Sessions
  // ===========================================================================
  /**
   * Sessions - atomic execution units within a thread.
   *
   * Lifecycle:
   * - active: User can send messages
   * - processing: AI is generating a response
   * - closed: Session ended (auto-close after 3h or manual)
   *
   * Sessions snapshot both the system prompt and user knowledge at creation
   * time, providing consistency even if the persona or knowledge changes.
   *
   * Auto-close triggers Cortex ingest to persist learnings to knowledge graph.
   */
  sessions: defineTable({
    /** Owner of this session */
    userId: v.id("users"),
    /** Parent thread */
    threadId: v.id("threads"),
    /** Current lifecycle status */
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
    /**
     * Compiled user knowledge from Cortex (injected into context).
     * Optional: undefined on first session before any ingestion,
     * or when hydration hasn't completed yet.
     */
    cachedUserKnowledge: v.optional(v.string()),
    /**
     * Snapshot of the combined system prompt (persona + user instructions).
     * Always set at session creation time.
     */
    cachedSystemPrompt: v.string(),
    /** Session creation timestamp */
    startedAt: v.number(),
    /** Session close timestamp (set when status -> closed) */
    endedAt: v.optional(v.number()),
    /** Last message timestamp (used for staleness detection) */
    lastMessageAt: v.number(),
    /** Scheduled auto-close job ID (for cancellation on activity) */
    closerJobId: v.optional(v.id("_scheduled_functions")),
  }).index("by_thread_status", ["threadId", "status"]),

  // ===========================================================================
  // Messages
  // ===========================================================================
  /**
   * Messages - individual chat messages within a thread/session.
   *
   * Supports:
   * - User messages (role: "user")
   * - AI responses (role: "assistant") with streaming
   * - Error states (type: "error") for failed generations
   * - Analytics metadata (tokens, latency, cost)
   */
  messages: defineTable({
    /** Parent thread (for efficient listing) */
    threadId: v.id("threads"),
    /** Parent session (for session dividers and Cortex ingest) */
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
  })
    .index("by_thread", ["threadId"])
    .index("by_session", ["sessionId"]),
});
