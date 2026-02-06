import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";

// =============================================================================
// Configuration
// =============================================================================

/** Maximum length for user display name */
const MAX_NAME_LENGTH = 100;

/** Minimum length for user display name */
const MIN_NAME_LENGTH = 1;

// =============================================================================
// User Management Helpers
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
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
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
    throw new Error("Authentication required");
  }

  // Check for existing user
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (existingUser) {
    return existingUser;
  }

  // Derive display name from identity (prefer name > email > fallback)
  const displayName = sanitizeName(
    identity.name ?? identity.email ?? "Anonymous"
  );

  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: displayName,
  });

  const newUser = await ctx.db.get(userId);
  if (!newUser) {
    // This should never happen - insert succeeded
    throw new Error("User creation failed unexpectedly");
  }

  console.log("[users.getOrCreateUser] Created new user", {
    userId: newUser._id,
    name: displayName,
  });

  return newUser;
}

/**
 * Sanitize and validate a display name.
 * Trims whitespace and enforces length limits.
 */
function sanitizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Anonymous";
  }
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Resolve a user by their Clerk token identifier.
 * Used by actions that cannot access ctx.db directly.
 */
export const getByToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier)
      )
      .unique();
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get the current authenticated user.
 * Returns null if not authenticated.
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
 * Call on app initialization to create user record if needed.
 * Idempotent - safe to call multiple times.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    return getOrCreateUser(ctx);
  },
});

/**
 * Update the current user's display name.
 * Validates and sanitizes the input.
 */
export const updateProfile = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate and sanitize input
    const name = args.name.trim();

    if (name.length < MIN_NAME_LENGTH) {
      throw new Error("Name cannot be empty");
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name cannot exceed ${MAX_NAME_LENGTH} characters`);
    }

    const user = await getOrCreateUser(ctx);
    const previousName = user.name;

    await ctx.db.patch(user._id, { name });

    console.log("[users.updateProfile] Profile updated", {
      userId: user._id,
      previousName,
      newName: name,
    });

    return ctx.db.get(user._id);
  },
});
