import { query } from "./_generated/server";
import { getCurrentUser } from "./users";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a user is the shared demo account.
 * Compares tokenIdentifier against the DEMO_USER_TOKEN_IDENTIFIER env variable.
 */
export function isDemoUser(user: { tokenIdentifier: string }): boolean {
  const demoToken = process.env.DEMO_USER_TOKEN_IDENTIFIER;
  if (!demoToken) return false;
  return user.tokenIdentifier === demoToken;
}

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Check if the current authenticated user is the demo account.
 * Returns false if not authenticated or env var not set.
 */
export const isDemoUserQuery = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;
    return isDemoUser(user);
  },
});
