import { defineSchema, defineTable } from "convex/server";
import { v, type Infer, type GenericValidator } from "convex/values";
import { promptSnapshotValidator } from "./prompts";
import { CHAT_MODELS, LEGACY_CHAT_MODELS } from "./chatModels";

const consultationStageUsage = v.object({
  prompt_tokens: v.number(),
  completion_tokens: v.number(),
  total_tokens: v.number(),
  thoughts_tokens: v.number(),
  cached_tokens: v.number(),
  cost: v.union(v.number(), v.null()),
});

/** Internal observability only: omitted by every public message query. */
export const consultationMetadataValidator = v.object({
  policy_version: v.literal("v1"),
  trace_id: v.optional(v.string()),
  status: v.union(
    v.literal("routing_failed"),
    v.literal("skipped"),
    v.literal("draft_failed"),
    v.literal("advice_failed"),
    v.literal("consulted"),
    v.literal("final_failed"),
    v.literal("final_failed_partial"),
    v.literal("cancelled"),
  ),
  category: v.optional(
    v.union(v.literal("general"), v.literal("medical"), v.literal("mixed")),
  ),
  probability: v.optional(v.number()),
  model: v.optional(v.string()),
  reasoning_effort: v.optional(v.string()),
  search_used: v.optional(v.boolean()),
  search_requests: v.optional(v.number()),
  sources: v.optional(
    v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        provenance: v.optional(
          v.union(v.literal("provider_annotation"), v.literal("model_link")),
        ),
      }),
    ),
  ),
  routing_ms: v.optional(v.number()),
  advice_ms: v.optional(v.number()),
  error_type: v.optional(v.string()),
  stages: v.optional(
    v.object({
      routing: v.optional(consultationStageUsage),
      draft: v.optional(consultationStageUsage),
      advice: v.optional(consultationStageUsage),
      published: v.optional(consultationStageUsage),
      failed_final: v.optional(consultationStageUsage),
    }),
  ),
  known_cost_usd: v.optional(v.number()),
  cost_complete: v.optional(v.boolean()),
});

export type ConsultationMetadata = Infer<typeof consultationMetadataValidator>;

/** Validate untrusted HTTP data against the same shape used for persistence. */
export function parseConsultationMetadata(
  value: unknown,
): ConsultationMetadata | undefined {
  // This metadata must stay small, contain finite nonnegative metrics, and never
  // prevent publishing a valid answer when an upstream version/shape changes.
  const matches = (
    candidate: unknown,
    validator: GenericValidator,
  ): boolean => {
    switch (validator.kind) {
      case "null":
        return candidate === null;
      case "string":
        return typeof candidate === "string" && candidate.length <= 4000;
      case "float64":
        return (
          typeof candidate === "number" &&
          Number.isFinite(candidate) &&
          candidate >= 0
        );
      case "boolean":
        return typeof candidate === "boolean";
      case "literal":
        return candidate === validator.value;
      case "array":
        return (
          Array.isArray(candidate) &&
          candidate.length <= 50 &&
          candidate.every((item) => matches(item, validator.element))
        );
      case "union":
        return validator.members.some((member) => matches(candidate, member));
      case "object": {
        if (
          !candidate ||
          typeof candidate !== "object" ||
          Array.isArray(candidate)
        )
          return false;
        const record = candidate as Record<string, unknown>;
        return (
          Object.keys(record).every((key) =>
            Object.prototype.hasOwnProperty.call(validator.fields, key),
          ) &&
          Object.entries(validator.fields).every(([key, field]) =>
            record[key] === undefined
              ? field.isOptional === "optional"
              : matches(record[key], field),
          )
        );
      }
      case "any":
      case "bytes":
      case "commitTs":
      case "id":
      case "int64":
      case "record":
        return false;
    }
  };
  if (!matches(value, consultationMetadataValidator)) return undefined;
  const metadata = value as ConsultationMetadata;
  if (metadata.probability !== undefined && metadata.probability > 1)
    return undefined;
  if (metadata.sources?.some((source) => !/^https?:\/\//i.test(source.url)))
    return undefined;
  return metadata;
}

export default defineSchema({
  // ===========================================================================
  // Users
  // ===========================================================================
  /** Linked to Clerk via tokenIdentifier. Created on first auth. */
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    /** New turns use this assignment; absent means Gemini through Vertex. */
    chatModel: v.optional(
      v.union(
        ...[...CHAT_MODELS, ...LEGACY_CHAT_MODELS].map((model) =>
          v.literal(model.id),
        ),
      ),
    ),
    /** Absent/false enables blind evaluation with no client model controls. */
    modelSelectorEnabled: v.optional(v.boolean()),
    /** Plan tier — undefined defaults to "free" */
    plan: v.optional(
      v.union(v.literal("unlimited"), v.literal("pro"), v.literal("free")),
    ),
    /** Applied to all personas as extra system prompt context */
    customInstructions: v.optional(v.string()),
    /** Deprecated experiment preference, retained for stored documents only. */
    preferredPromptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured")),
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
    /** Deprecated experiment mirrors, retained for stored documents only. */
    activeSessionId: v.optional(v.id("sessions")),
    activePromptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured")),
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
      v.literal("closed"),
    ),
    /** Immutable prompt mode for every generation in this session */
    promptMode: v.optional(
      v.union(v.literal("legacy"), v.literal("structured")),
    ),
    /** Deprecated experiment lock, retained for stored documents only. */
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
      v.literal("failed"),
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
    /** Frozen choice for this turn; absent on historical/mobile messages. */
    generationTarget: v.optional(
      v.object({
        provider: v.union(v.literal("vertex"), v.literal("openrouter")),
        model: v.string(),
      }),
    ),
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
            v.literal("legacyFallback"),
          ),
        ),
      }),
    ),
    /** Assistant-only analytics */
    metadata: v.optional(
      v.object({
        model: v.optional(v.string()),
        provider: v.optional(
          v.union(v.literal("vertex"), v.literal("openrouter")),
        ),
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
        consultation: v.optional(consultationMetadataValidator),
        latencyMs: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        usedFallback: v.optional(v.boolean()),
        error: v.optional(v.string()),
        errorCode: v.optional(v.string()),
      }),
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
  /** One reusable daily quota record per user; no recorded content. */
  audio_transcription_limits: defineTable({
    userId: v.id("users"),
    day: v.string(),
    attempts: v.number(),
    requestId: v.string(),
    activeUntil: v.number(),
  }).index("by_user", ["userId"]),

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
