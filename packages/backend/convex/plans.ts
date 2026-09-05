// =============================================================================
// Plan Tiers & Limits
// =============================================================================

/**
 * All plans use the same shape. -1 means unlimited.
 * To add a new plan, just add a key here and a literal to the schema validator.
 */
export const PLAN_LIMITS = {
  free: {
    dailyMessages: 10,
    dailyOutputTokens: 15_000,
  },
  pro: {
    dailyMessages: 50,
    dailyOutputTokens: 50_000,
  },
  unlimited: {
    dailyMessages: -1,
    dailyOutputTokens: -1,
  },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

/** Returns true if usage is within the limit. -1 = unlimited. */
export function isWithinLimit(used: number, limit: number): boolean {
  return limit === -1 || used < limit;
}

/**
 * Resolve a user's plan tier from the DB field.
 * Defaults to "free" if not set.
 */
export function resolveUserPlan(user: { plan?: string }): PlanTier {
  if (user.plan && user.plan in PLAN_LIMITS) {
    return user.plan as PlanTier;
  }
  return "free";
}

// Contact info — centralised so the frontend and error messages stay in sync
export const CONTACT_INFO = {
  x: "https://x.com/juandastic",
  email: "juandastic@gmail.com",
} as const;
