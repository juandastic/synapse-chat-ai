import { query, internalMutation } from "./_generated/server";
import { getCurrentUser } from "./users";
import { Id } from "./_generated/dataModel";
import { SEED_DATA } from "./seed/seedDemoData";
import { createPromptSnapshot } from "./prompts";

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

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Seed demo account with synthetic data from seedDemoData.ts.
 *
 * Run manually from the Convex dashboard (no arguments needed).
 * Idempotent: deletes all existing demo data before inserting fresh records.
 * All sessions are "closed" so the next real interaction triggers hydration.
 */
export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoToken = process.env.DEMO_USER_TOKEN_IDENTIFIER;
    if (!demoToken) {
      throw new Error("DEMO_USER_TOKEN_IDENTIFIER env var not set");
    }

    // -------------------------------------------------------------------------
    // 1. Resolve or create the demo user
    // -------------------------------------------------------------------------
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", demoToken))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, {
        name: SEED_DATA.user.name,
        customInstructions: SEED_DATA.user.customInstructions,
      });
    } else {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: demoToken,
        name: SEED_DATA.user.name,
        customInstructions: SEED_DATA.user.customInstructions,
      });
      user = (await ctx.db.get(userId))!;
    }

    const userId = user._id;

    // -------------------------------------------------------------------------
    // 2. Delete existing demo data (cascade: messages → sessions → threads → personas → cortex_jobs)
    // -------------------------------------------------------------------------
    const existingThreads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const thread of existingThreads) {
      // Delete all messages in thread
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect();
      for (const msg of messages) {
        await ctx.db.delete(msg._id);
      }

      // Delete all sessions in thread (cancel any scheduled closers)
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_thread_status", (q) => q.eq("threadId", thread._id))
        .collect();
      for (const session of sessions) {
        if (session.closerJobId) {
          await ctx.scheduler.cancel(session.closerJobId);
        }
        await ctx.db.delete(session._id);
      }

      await ctx.db.delete(thread._id);
    }

    // Delete all personas
    const existingPersonas = await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const persona of existingPersonas) {
      await ctx.db.delete(persona._id);
    }

    // Delete cortex_jobs
    const statuses = ["pending", "processing", "completed", "failed"] as const;
    for (const status of statuses) {
      const jobs = await ctx.db
        .query("cortex_jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", status)
        )
        .collect();
      for (const job of jobs) {
        await ctx.db.delete(job._id);
      }
    }

    // -------------------------------------------------------------------------
    // 3. Insert personas and build ID map
    // -------------------------------------------------------------------------
    const personaMap = new Map<string, Id<"personas">>();
    const personaSeedMap = new Map(
      SEED_DATA.personas.map((persona) => [persona.localId, persona])
    );
    for (const p of SEED_DATA.personas) {
      const id = await ctx.db.insert("personas", {
        userId,
        name: p.name,
        description: p.description,
        language: p.language,
        systemPrompt: p.systemPrompt,
        icon: p.icon,
        isDefault: p.isDefault,
      });
      personaMap.set(p.localId, id);
    }

    // -------------------------------------------------------------------------
    // 4. Insert threads → sessions → messages
    // -------------------------------------------------------------------------
    let totalSessions = 0;
    let totalMessages = 0;

    for (const t of SEED_DATA.threads) {
      const personaId = personaMap.get(t.personaLocalId);
      if (!personaId) {
        throw new Error(`Unknown persona localId: ${t.personaLocalId}`);
      }
      const personaSeed = personaSeedMap.get(t.personaLocalId);
      if (!personaSeed) {
        throw new Error(`Unknown persona seed: ${t.personaLocalId}`);
      }

      const promptSnapshot = createPromptSnapshot({
        promptMode: "legacy",
        legacyPersonaPrompt: personaSeed.systemPrompt,
        language: personaSeed.language,
        customInstructions: SEED_DATA.user.customInstructions,
      });

      const threadId = await ctx.db.insert("threads", {
        userId,
        personaId,
        title: t.title,
        lastMessageAt: t.lastMessageAt,
      });

      for (const s of t.sessions) {
        const sessionId = await ctx.db.insert("sessions", {
          userId,
          threadId,
          status: "closed",
          promptMode: "legacy",
          promptSnapshot,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          lastMessageAt: s.lastMessageAt,
        });
        totalSessions++;

        for (const m of s.messages) {
          await ctx.db.insert("messages", {
            threadId,
            sessionId,
            role: m.role,
            content: m.content,
            type: m.type,
            completedAt: m.completedAt,
          });
          totalMessages++;
        }
      }
    }

    console.log("[demo.seedDemoData] Seeded demo data", {
      userId,
      personas: SEED_DATA.personas.length,
      threads: SEED_DATA.threads.length,
      sessions: totalSessions,
      messages: totalMessages,
    });
  },
});
