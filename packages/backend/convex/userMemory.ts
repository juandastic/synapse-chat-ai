import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { getCurrentUser } from "./users";
import { Id } from "./_generated/dataModel";

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get memory stats for the current user.
 * Powers the Memory Pulse UI indicator on home screen and chat header.
 * Reactive — auto-updates when stats change (e.g., after hydration).
 *
 * This table only stores lightweight numeric stats (~200 bytes).
 * The heavy knowledge string lives in user_knowledge_cache (internal only).
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("user_memory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Upsert memory stats after hydration or ingest completion.
 * Only stores numeric stats — the knowledge string goes to user_knowledge_cache.
 */
export const upsert = internalMutation({
  args: {
    userId: v.id("users"),
    entityCount: v.optional(v.number()),
    relationshipCount: v.optional(v.number()),
    totalChars: v.optional(v.number()),
    includedEntityCount: v.optional(v.number()),
    includedRelationshipCount: v.optional(v.number()),
    isPartial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_memory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const totalChars = args.totalChars ?? existing?.totalChars ?? 0;
    const totalTokens = Math.round(totalChars / 4);

    const fields = {
      entityCount: args.entityCount ?? existing?.entityCount ?? 0,
      relationshipCount:
        args.relationshipCount ?? existing?.relationshipCount ?? 0,
      includedEntityCount:
        args.includedEntityCount ?? existing?.includedEntityCount ?? 0,
      includedRelationshipCount:
        args.includedRelationshipCount ??
        existing?.includedRelationshipCount ??
        0,
      totalChars,
      totalTokens,
      isPartial: args.isPartial ?? existing?.isPartial ?? false,
      lastUpdatedAt: Date.now(),
    };

    if (existing) {
      // Skip write if nothing changed — avoids triggering reactive subscriptions
      const unchanged =
        existing.entityCount === fields.entityCount &&
        existing.relationshipCount === fields.relationshipCount &&
        existing.includedEntityCount === fields.includedEntityCount &&
        existing.includedRelationshipCount ===
          fields.includedRelationshipCount &&
        existing.totalChars === fields.totalChars &&
        existing.isPartial === fields.isPartial;
      if (unchanged) return;

      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("user_memory", {
        userId: args.userId as Id<"users">,
        ...fields,
      });
    }
  },
});
