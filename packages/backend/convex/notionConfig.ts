import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

// =============================================================================
// Public Queries
// =============================================================================

/** Return the saved Notion config for the current user. */
export const getNotionConfig = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      notionToken: user.notionToken ?? "",
      notionPageName: user.notionPageName ?? "",
      notionLanguage: user.notionLanguage ?? "English",
    };
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/** Persist Notion integration config for the current user. */
export const saveNotionConfig = mutation({
  args: {
    notionToken: v.string(),
    notionPageName: v.string(),
    notionLanguage: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Authentication required");

    await ctx.db.patch(user._id, {
      notionToken: args.notionToken,
      notionPageName: args.notionPageName,
      notionLanguage: args.notionLanguage,
    });
  },
});

// =============================================================================
// Internal Mutations (called from Node.js actions in notion.ts)
// =============================================================================

export const saveNotionConfigInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notionToken: v.string(),
    notionPageName: v.string(),
    notionLanguage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      notionToken: args.notionToken,
      notionPageName: args.notionPageName,
      notionLanguage: args.notionLanguage,
    });
  },
});
