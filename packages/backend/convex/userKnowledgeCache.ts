import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get cached knowledge by userId.
 * Used by chat.prepareContext to inject compiled knowledge into AI context.
 * Internal only — never exposed to the frontend.
 */
export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("user_knowledge_cache")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Upsert the knowledge cache after hydration or ingest.
 * Stores the heavy ~30K compiled knowledge string separately from stats.
 */
export const upsert = internalMutation({
  args: {
    userId: v.id("users"),
    cachedUserKnowledge: v.string(),
    compilationMetadata: v.optional(v.any()),
    cacheName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_knowledge_cache")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const fields = {
      cachedUserKnowledge: args.cachedUserKnowledge,
      compilationMetadata: args.compilationMetadata,
      cacheName: args.cacheName,
      lastUpdatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("user_knowledge_cache", {
        userId: args.userId as Id<"users">,
        ...fields,
      });
    }
  },
});
