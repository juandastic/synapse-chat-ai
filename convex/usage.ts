import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// =============================================================================
// Types
// =============================================================================

/** Shape of each daily slot inside dailyStats. */
interface DayStats {
  chatMessages: number;
  chatChars: number;
  inputTokens: number;
  outputTokens: number;
  ingestions: number;
  corrections: number;
  ingestedChars: number;
}

/** Zero-initialized daily stats. */
function emptyDayStats(): DayStats {
  return {
    chatMessages: 0,
    chatChars: 0,
    inputTokens: 0,
    outputTokens: 0,
    ingestions: 0,
    corrections: 0,
    ingestedChars: 0,
  };
}

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

    if (!existing) {
      // First activity this month — create the document
      const dayStats: DayStats = emptyDayStats();

      if (type === "chat") {
        dayStats.chatMessages += count;
        dayStats.chatChars += chars;
        dayStats.inputTokens += tokensIn;
        dayStats.outputTokens += tokensOut;
      } else if (type === "ingest") {
        dayStats.ingestions += count;
        dayStats.ingestedChars += chars;
      } else if (type === "correction") {
        dayStats.corrections += count;
        dayStats.ingestedChars += chars;
      }

      await ctx.db.insert("monthly_usage", {
        userId: args.userId,
        month,
        totalChatMessages: type === "chat" ? count : 0,
        totalChatCharsGenerated: type === "chat" ? chars : 0,
        totalInputTokens: type === "chat" ? tokensIn : 0,
        totalOutputTokens: type === "chat" ? tokensOut : 0,
        totalIngestions: type === "ingest" ? count : 0,
        totalCorrections: type === "correction" ? count : 0,
        totalIngestedChars:
          type === "ingest" || type === "correction" ? chars : 0,
        dailyStats: { [day]: dayStats },
      });

      return;
    }

    // Existing document — update in place
    const dailyStats: Record<string, DayStats> = existing.dailyStats ?? {};
    const daySlot: DayStats = dailyStats[day] ?? emptyDayStats();

    // Increment global totals based on type
    let chatMessagesDelta = 0;
    let chatCharsDelta = 0;
    let inputTokensDelta = 0;
    let outputTokensDelta = 0;
    let ingestionsDelta = 0;
    let correctionsDelta = 0;
    let ingestedCharsDelta = 0;

    if (type === "chat") {
      chatMessagesDelta = count;
      chatCharsDelta = chars;
      inputTokensDelta = tokensIn;
      outputTokensDelta = tokensOut;

      daySlot.chatMessages += count;
      daySlot.chatChars += chars;
      daySlot.inputTokens += tokensIn;
      daySlot.outputTokens += tokensOut;
    } else if (type === "ingest") {
      ingestionsDelta = count;
      ingestedCharsDelta = chars;

      daySlot.ingestions += count;
      daySlot.ingestedChars += chars;
    } else if (type === "correction") {
      correctionsDelta = count;
      ingestedCharsDelta = chars;

      daySlot.corrections += count;
      daySlot.ingestedChars += chars;
    }

    dailyStats[day] = daySlot;

    await ctx.db.patch(existing._id, {
      totalChatMessages: existing.totalChatMessages + chatMessagesDelta,
      totalChatCharsGenerated:
        existing.totalChatCharsGenerated + chatCharsDelta,
      totalInputTokens: existing.totalInputTokens + inputTokensDelta,
      totalOutputTokens: existing.totalOutputTokens + outputTokensDelta,
      totalIngestions: existing.totalIngestions + ingestionsDelta,
      totalCorrections: existing.totalCorrections + correctionsDelta,
      totalIngestedChars: existing.totalIngestedChars + ingestedCharsDelta,
      dailyStats,
    });
  },
});
