import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// =============================================================================
// Internal Mutation
// =============================================================================

/**
 * Track a usage event for a user.
 *
 * Upserts the monthly_usage document for the current month, incrementing
 * both the global aggregates and the per-day slot in dailyStats.
 *
 * Called from actions (chat, cortexProcessor) via ctx.runMutation.
 * This is purely observational — no blocking, quotas, or limits.
 */
export const trackActivity = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("chat"),
      v.literal("ingest"),
      v.literal("correction")
    ),
    metrics: v.object({
      tokensIn: v.optional(v.number()),
      tokensOut: v.optional(v.number()),
      chars: v.optional(v.number()),
      count: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const day = String(now.getUTCDate()).padStart(2, "0");

    const { type, metrics } = args;
    const tokensIn = metrics.tokensIn ?? 0;
    const tokensOut = metrics.tokensOut ?? 0;
    const chars = metrics.chars ?? 0;
    const count = metrics.count ?? 1;

    // Find existing document for this user + month
    const existing = await ctx.db
      .query("monthly_usage")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", args.userId).eq("month", month)
      )
      .unique();

    const delta = {
      chatMessages: type === "chat" ? count : 0,
      chatChars: type === "chat" ? chars : 0,
      inputTokens: type === "chat" ? tokensIn : 0,
      outputTokens: type === "chat" ? tokensOut : 0,
      ingestions: type === "ingest" ? count : 0,
      corrections: type === "correction" ? count : 0,
      ingestedChars: type === "ingest" || type === "correction" ? chars : 0,
    };
    const daySlot: Partial<typeof delta> | undefined = existing?.dailyStats?.[day];
    const dailyStats = {
      ...existing?.dailyStats,
      [day]: {
        ...daySlot,
        chatMessages: (daySlot?.chatMessages ?? 0) + delta.chatMessages,
        chatChars: (daySlot?.chatChars ?? 0) + delta.chatChars,
        inputTokens: (daySlot?.inputTokens ?? 0) + delta.inputTokens,
        outputTokens: (daySlot?.outputTokens ?? 0) + delta.outputTokens,
        ingestions: (daySlot?.ingestions ?? 0) + delta.ingestions,
        corrections: (daySlot?.corrections ?? 0) + delta.corrections,
        ingestedChars: (daySlot?.ingestedChars ?? 0) + delta.ingestedChars,
      },
    };
    const totals = {
      totalChatMessages: (existing?.totalChatMessages ?? 0) + delta.chatMessages,
      totalChatCharsGenerated: (existing?.totalChatCharsGenerated ?? 0) + delta.chatChars,
      totalInputTokens: (existing?.totalInputTokens ?? 0) + delta.inputTokens,
      totalOutputTokens: (existing?.totalOutputTokens ?? 0) + delta.outputTokens,
      totalIngestions: (existing?.totalIngestions ?? 0) + delta.ingestions,
      totalCorrections: (existing?.totalCorrections ?? 0) + delta.corrections,
      totalIngestedChars: (existing?.totalIngestedChars ?? 0) + delta.ingestedChars,
      dailyStats,
    };

    if (existing) {
      await ctx.db.patch(existing._id, totals);
    } else {
      await ctx.db.insert("monthly_usage", {
        userId: args.userId,
        month,
        ...totals,
      });
    }
  },
});
