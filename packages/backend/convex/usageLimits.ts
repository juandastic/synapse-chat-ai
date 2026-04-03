import { v } from "convex/values";
import { query, internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import {
  PLAN_LIMITS,
  PlanTier,
  isWithinLimit,
  resolveUserPlan,
  CONTACT_INFO,
} from "./plans";
import { getCurrentUser } from "./users";

// =============================================================================
// Types
// =============================================================================

interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getTodayKey(): { month: string; day: string } {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const day = String(now.getUTCDate()).padStart(2, "0");
  return { month, day };
}

interface DayStats {
  chatMessages?: number;
  outputTokens?: number;
}

async function getDayStats(
  ctx: QueryCtx | MutationCtx,
  userId: Doc<"users">["_id"]
): Promise<DayStats> {
  const { month, day } = getTodayKey();

  const usage = await ctx.db
    .query("monthly_usage")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();

  if (!usage) return {};

  const dailyStats = usage.dailyStats as Record<string, Record<string, number>> | undefined;
  const daySlot = dailyStats?.[day];
  if (!daySlot) return {};

  return {
    chatMessages: daySlot.chatMessages ?? 0,
    outputTokens: daySlot.outputTokens ?? 0,
  };
}

function buildLimitMessage(used: number, limit: number): string {
  return (
    `You've reached your daily limit of ${limit} messages (${used}/${limit}). ` +
    `Your limit resets at midnight UTC. ` +
    `For higher limits, reach out at ${CONTACT_INFO.x} or ${CONTACT_INFO.email}`
  );
}

// =============================================================================
// Core Check — usable from mutations and queries
// =============================================================================

/**
 * Check whether a user is within their daily usage limits.
 * Call from mutations (send, resend) before creating messages.
 */
export async function checkDailyUsage(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<UsageCheckResult> {
  const plan = resolveUserPlan(user);
  const limits = PLAN_LIMITS[plan];

  // Unlimited plan — skip DB read entirely
  if (limits.dailyMessages === -1 && limits.dailyOutputTokens === -1) {
    return { allowed: true };
  }

  const stats = await getDayStats(ctx, user._id);
  const usedMessages = stats.chatMessages ?? 0;
  const usedTokens = stats.outputTokens ?? 0;

  if (!isWithinLimit(usedMessages, limits.dailyMessages)) {
    return {
      allowed: false,
      reason: buildLimitMessage(usedMessages, limits.dailyMessages),
    };
  }

  if (!isWithinLimit(usedTokens, limits.dailyOutputTokens)) {
    return {
      allowed: false,
      reason:
        `You've reached your daily output token limit. ` +
        `Your limit resets at midnight UTC. ` +
        `For higher limits, reach out at ${CONTACT_INFO.x} or ${CONTACT_INFO.email}`,
    };
  }

  return { allowed: true };
}

// =============================================================================
// Internal Query — for use from httpAction (http.ts)
// =============================================================================

export const checkUsageQuery = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<UsageCheckResult> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { allowed: false, reason: "User not found" };
    return checkDailyUsage(ctx, user);
  },
});

// =============================================================================
// Public Query — frontend subscribes for usage indicator
// =============================================================================

export const getUsageStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const plan = resolveUserPlan(user);
    const limits = PLAN_LIMITS[plan];

    // Unlimited plans — skip monthly_usage read to avoid reactive re-evaluations
    if (limits.dailyMessages === -1 && limits.dailyOutputTokens === -1) {
      return {
        plan: plan as PlanTier,
        dailyMessages: { used: 0, limit: -1 },
        dailyOutputTokens: { used: 0, limit: -1 },
        resetInfo: "Your limit resets at midnight UTC",
        contactInfo: CONTACT_INFO,
      };
    }

    const stats = await getDayStats(ctx, user._id);

    return {
      plan: plan as PlanTier,
      dailyMessages: {
        used: stats.chatMessages ?? 0,
        limit: limits.dailyMessages,
      },
      dailyOutputTokens: {
        used: stats.outputTokens ?? 0,
        limit: limits.dailyOutputTokens,
      },
      resetInfo: "Your limit resets at midnight UTC",
      contactInfo: CONTACT_INFO,
    };
  },
});
