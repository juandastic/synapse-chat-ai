import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";

// =============================================================================
// User Management
// =============================================================================

/**
 * Get the current authenticated user from the database.
 * Returns null if not authenticated or user doesn't exist.
 *
 * @param ctx - Query or mutation context
 * @returns User document or null
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/**
 * Get or create the current authenticated user.
 * Creates a new user record if one doesn't exist for this Clerk identity.
 *
 * @param ctx - Mutation context
 * @returns User document (existing or newly created)
 * @throws Error if not authenticated
 */
export async function getOrCreateUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  // Check for existing user
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (existingUser) {
    return existingUser;
  }

  // Create new user
  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name ?? identity.email ?? "Anonymous",
  });

  const newUser = await ctx.db.get(userId);
  if (!newUser) {
    throw new Error("Failed to create user");
  }

  console.log("[users] New user created", { userId: newUser._id });
  return newUser;
}

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get the current authenticated user.
 * Use this in components to check authentication state.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return getCurrentUser(ctx);
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Ensure the current user exists in the database.
 * Call this on app initialization to create the user record if needed.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    return getOrCreateUser(ctx);
  },
});

/**
 * Update the current user's profile.
 */
export const updateProfile = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    await ctx.db.patch(user._id, { name: args.name });
    return ctx.db.get(user._id);
  },
});
