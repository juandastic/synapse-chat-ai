import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { promptSnapshotValidator } from "./prompts";

export default defineSchema({
  // ===========================================================================
  // Users
  // ===========================================================================
  /** Linked to Clerk via tokenIdentifier. Created on first auth. */
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    /** Plan tier — undefined defaults to "free" */
    plan: v.optional(v.union(v.literal("unlimited"), v.literal("pro"), v.literal("free"))),
    /** Applied to all personas as extra system prompt context */
    customInstructions: v.optional(v.string()),
    /** Default mode used when a new session is created */
    preferredPromptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured"))
    ),
    /** Notion integration config for knowledge graph export */
    notionToken: v.optional(v.string()),
    notionPageName: v.optional(v.string()),
    notionLanguage: v.optional(v.string()),
    /** Timestamp when user accepted Terms, Privacy, and minimum-age attestation at signup */
    termsConfirmedAt: v.optional(v.number()),
    /** Timestamp when the user dismissed the first-time memory intro toast */
    memoryIntroSeenAt: v.optional(v.number()),
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
    /** Role/domain-only prompt used by structured prompting when available */
    structuredRolePrompt: v.optional(v.string()),
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
    /** Lightweight mirror used by the chat UI without reading the prompt snapshot */
    activeSessionId: v.optional(v.id("sessions")),
    activePromptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured"))
    ),
    activePromptModeLockedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Sessions
  // ===========================================================================
  /**
   * Atomic execution units within a thread.
   *
   * Snapshot prompt versions and dynamic inputs at creation time for
   * consistency. Knowledge is read from the shared cache. Auto-close after 3h
   * triggers Cortex ingest.
   */
  sessions: defineTable({
    userId: v.id("users"),
    threadId: v.id("threads"),
    status: v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("closed")
    ),
    /** Immutable prompt mode for every generation in this session */
    promptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured"))
    ),
    /** Set by the first send; prompt selection stays locked if messages are deleted */
    promptModeLockedAt: v.optional(v.number()),
    /** Cortex-compiled user knowledge — undefined before first ingest */
    cachedUserKnowledge: v.optional(v.string()),
    /** Opaque Cortex metadata that describes how knowledge was compiled */
    compilationMetadata: v.optional(v.any()),
    /** Minimal immutable inputs used to render the selected prompt version */
    promptSnapshot: v.optional(promptSnapshotValidator),
    /** Frozen prompt for historical sessions created before prompt snapshots. */
    cachedSystemPrompt: v.optional(v.string()),
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
    /** Historical beta metadata. New messages derive prompt versions from their session. */
    generationConfig: v.optional(
      v.object({
        promptMode: v.union(v.literal("legacy"), v.literal("structured")),
        promptFormatVersion: v.optional(v.string()),
        productContractVersion: v.optional(v.string()),
        voicePromptVersion: v.optional(v.string()),
        personaPromptVersion: v.optional(v.string()),
        personaPromptSource: v.optional(
          v.union(
            v.literal("legacy"),
            v.literal("structured"),
            v.literal("legacyFallback")
          )
        ),
      })
    ),
    /** Assistant-only analytics */
    metadata: v.optional(
      v.object({
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
        cost: v.optional(v.number()),
        latencyMs: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        usedFallback: v.optional(v.boolean()),
        error: v.optional(v.string()),
        errorCode: v.optional(v.string()),
      })
    ),
  })
    .index("by_thread", ["threadId"])
    .index("by_session", ["sessionId"]),

  // ===========================================================================
  // User Memory
  // ===========================================================================
  /**
   * Single source of truth for compiled knowledge + graph statistics per user.
   * Updated on every hydration. Replaces per-session cachedUserKnowledge
   * duplication (sessions retain the field for backwards compat but new code
   * reads/writes here instead).
   */
  /**
   * Lightweight stats for the frontend (reactive subscriptions).
   * ~200 bytes per doc — safe for frequent reactive reads.
   */
  user_memory: defineTable({
    userId: v.id("users"),

    // Graph totals (all entities/relationships in Neo4j for this user)
    entityCount: v.number(),
    relationshipCount: v.number(),

    // Included in compilation (prioritized for context window)
    includedEntityCount: v.number(),
    includedRelationshipCount: v.number(),

    // Total graph content size (sum of all entity summaries + relationship facts)
    // Grows with actual memory, not capped by compilation budget
    totalChars: v.number(),
    totalTokens: v.number(),

    // true = compilation budget exceeded, RAG active for long-tail memories
    isPartial: v.boolean(),

    lastUpdatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /**
   * Heavy knowledge cache — internal only, never sent to frontend.
   * Contains the ~30K compiled knowledge string + compilation metadata.
   * Read by chat.prepareContext (internal query, non-reactive).
   */
  user_knowledge_cache: defineTable({
    userId: v.id("users"),
    /** Cortex-compiled user knowledge — the string injected into AI context */
    cachedUserKnowledge: v.string(),
    /** Opaque Cortex metadata (included_node_ids, included_edge_ids, etc.) */
    compilationMetadata: v.optional(v.any()),
    /**
     * Gemini CachedContent resource name (e.g. "cachedContents/abc123") for
     * the compilation. When present, the chat request forwards it to Cortex
     * so Gemini serves the compilation as a cached prefix (~75% cheaper on
     * repeated tokens). Undefined when the compilation was too small to
     * cache or the upstream cache creation failed.
     */
    cacheName: v.optional(v.string()),
    lastUpdatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ===========================================================================
  // Usage Tracking
  // ===========================================================================
  /**
   * Monthly bucket with daily slots pattern.
   * One document per user per month. dailyStats holds per-day breakdowns.
   * No cost estimation — raw token/char counts only.
   */
  monthly_usage: defineTable({
    userId: v.id("users"),
    month: v.string(), // "YYYY-MM"

    // Global aggregates (fast monthly totals)
    totalChatMessages: v.number(),
    totalChatCharsGenerated: v.number(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalIngestions: v.number(),
    totalCorrections: v.number(),
    totalIngestedChars: v.number(),

    // Daily breakdown — key = "DD", value = day stats object
    dailyStats: v.any(),
  }).index("by_user_month", ["userId", "month"]),
});
