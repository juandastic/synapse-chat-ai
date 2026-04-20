import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";

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

  // PostHog: identify new user and capture signup event
  await ctx.scheduler.runAfter(0, internal.analytics.identify, {
    distinctId: newUser._id,
    properties: {
      name: displayName,
      created_at: new Date().toISOString(),
    },
  });
  await ctx.scheduler.runAfter(0, internal.analytics.capture, {
    distinctId: newUser._id,
    event: "user created",
    properties: { name: displayName },
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

    // PostHog: track profile update and refresh person properties
    await ctx.scheduler.runAfter(0, internal.analytics.capture, {
      distinctId: user._id,
      event: "profile updated",
      properties: {
        $set: { name },
      },
    });

    return ctx.db.get(user._id);
  },
});

/**
 * Records that the user accepted Terms, Privacy, and the minimum-age attestation
 * shown at signup. Safe to fire-and-forget on every authenticated mount.
 */
export const confirmTerms = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await getOrCreateUser(ctx);
    if (user.termsConfirmedAt) return user;
    await ctx.db.patch(user._id, { termsConfirmedAt: Date.now() });
    return ctx.db.get(user._id);
  },
});

/**
 * Marks the first-time memory intro as seen so it won't re-appear.
 */
export const setMemoryIntroSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    if (user.memoryIntroSeenAt) return user;
    await ctx.db.patch(user._id, { memoryIntroSeenAt: Date.now() });
    return ctx.db.get(user._id);
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Manually set a user's plan tier.
 * Run from the Convex dashboard for one-off upgrades/downgrades.
 */
export const setUserPlan = internalMutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("unlimited"), v.literal("pro"), v.literal("free")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, { plan: args.plan });

    console.log("[users.setUserPlan] Plan updated", {
      userId: args.userId,
      previousPlan: user.plan ?? "free",
      newPlan: args.plan,
    });
  },
});
