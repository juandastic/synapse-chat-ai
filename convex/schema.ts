import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ===========================================================================
  // Users
  // ===========================================================================
  /** Linked to Clerk via tokenIdentifier. Created on first auth. */
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    /** Applied to all personas as extra system prompt context */
    customInstructions: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  // ===========================================================================
  // Personas
  // ===========================================================================
  /** AI personality templates (system prompt + identity). */
  personas: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    language: v.string(),
    systemPrompt: v.string(),
    icon: v.string(), // emoji or URL
    isDefault: v.boolean(),
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Threads
  // ===========================================================================
  /** Conversation channels. Persona link is immutable after creation. */
  threads: defineTable({
    userId: v.id("users"),
    personaId: v.id("personas"),
    title: v.string(),
    lastMessageAt: v.number(), // used for sidebar sorting
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Sessions
  // ===========================================================================
  /**
   * Atomic execution units within a thread.
   *
   * Snapshot the system prompt and user knowledge at creation time for
   * consistency. Auto-close after 3h triggers Cortex ingest.
   */
  sessions: defineTable({
    userId: v.id("users"),
    threadId: v.id("threads"),
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
    /** Cortex-compiled user knowledge — undefined before first ingest */
    cachedUserKnowledge: v.optional(v.string()),
    /** Snapshot of persona + user instructions at session start */
    cachedSystemPrompt: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    lastMessageAt: v.number(), // staleness detection
    closerJobId: v.optional(v.id("_scheduled_functions")),
  }).index("by_thread_status", ["threadId", "status"]),

  // ===========================================================================
  // Cortex Jobs
  // ===========================================================================
  /**
   * Async processing queue for Cortex API operations.
   * Retries with backoff: immediate → 2m → 10m → 30m → 30m (5 max).
   */
  cortex_jobs: defineTable({
    userId: v.id("users"),
    sessionId: v.optional(v.id("sessions")),
    type: v.union(v.literal("ingest"), v.literal("correction")),
    payload: v.any(),

    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    attempts: v.number(),
    maxAttempts: v.number(),
    lastError: v.optional(v.string()),

    nextRetryAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  // ===========================================================================
  // Messages
  // ===========================================================================
  messages: defineTable({
    threadId: v.id("threads"),
    sessionId: v.id("sessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    /** Updated in-place during streaming for assistant messages */
    content: v.string(),
    /** R2 keys — user messages only */
    imageKeys: v.optional(v.array(v.string())),
    /** "error" = generation failed */
    type: v.union(v.literal("text"), v.literal("error")),
    /** undefined while still streaming */
    completedAt: v.optional(v.number()),
    /** Assistant-only analytics */
    metadata: v.optional(
      v.object({
        model: v.optional(v.string()),
        promptTokens: v.optional(v.number()),
        completionTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cost: v.optional(v.number()),
        latencyMs: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        error: v.optional(v.string()),
        errorCode: v.optional(v.string()),
      })
    ),
  })
    .index("by_thread", ["threadId"])
    .index("by_session", ["sessionId"]),
});
