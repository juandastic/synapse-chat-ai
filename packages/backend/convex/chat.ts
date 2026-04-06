"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { r2 } from "./r2";
import { CompilationMetadata } from "./cortexConfig";

// =============================================================================
// Configuration
// =============================================================================

// =============================================================================
// Types
// =============================================================================

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ApiMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

// =============================================================================
// Context Preparation
// =============================================================================

/**
 * Build the API messages array for a chat generation request.
 *
 * Reads the session snapshot and recent messages, resolves R2 image URLs,
 * and returns everything the HTTP streaming endpoint needs to call Cortex.
 *
 * Runs as a Node.js action because the R2 component requires the Node runtime.
 */
export const prepareContext = internalAction({
  args: {
    sessionId: v.id("sessions"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args): Promise<{
    apiMessages: ApiMessage[];
    userId: string;
    requestId: string;
    compilationMetadata?: CompilationMetadata;
  }> => {
    const session: Doc<"sessions"> | null = await ctx.runQuery(
      internal.sessions.get,
      { id: args.sessionId }
    );

    if (!session) {
      throw new Error("Session not found");
    }

    const history: Doc<"messages">[] = await ctx.runQuery(
      internal.messages.getBySession,
      { sessionId: args.sessionId }
    );

    const currentDateTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    // Read compiled knowledge from user_knowledge_cache (single source of truth),
    // falling back to session for users who haven't hydrated since the migration.
    const knowledgeCache = await ctx.runQuery(
      internal.userKnowledgeCache.getByUserId,
      { userId: session.userId }
    );
    const userKnowledge =
      knowledgeCache?.cachedUserKnowledge ?? session.cachedUserKnowledge;

    let systemContent = session.cachedSystemPrompt;
    systemContent += `\n\nCurrent date and time: ${currentDateTime}`;
    if (userKnowledge) {
      systemContent += `\n\n${userKnowledge}`;
    }

    const filteredHistory = history.filter(
      (m) => m._id !== args.assistantMessageId
    );

    const apiMessages: ApiMessage[] = [
      { role: "system", content: systemContent },
    ];

    for (const m of filteredHistory) {
      const hasImages =
        m.role === "user" && m.imageKeys && m.imageKeys.length > 0;

      if (hasImages) {
        const parts: ContentPart[] = [];

        for (const key of m.imageKeys!) {
          const url = await r2.getUrl(key);
          parts.push({ type: "image_url", image_url: { url } });
        }

        if (m.content) {
          parts.push({ type: "text", text: m.content });
        }

        apiMessages.push({ role: "user", content: parts });
      } else {
        apiMessages.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      }
    }

    const requestId = `gen-${args.sessionId.slice(-6)}-${Date.now().toString(36)}`;

    const compilationMetadata =
      knowledgeCache?.compilationMetadata ?? session.compilationMetadata;

    console.log("[chat.prepareContext] Context ready", {
      requestId,
      sessionId: args.sessionId,
      historyCount: filteredHistory.length,
      hasUserKnowledge: !!userKnowledge,
      knowledgeSource: knowledgeCache?.cachedUserKnowledge ? "user_knowledge_cache" : "session",
      systemPromptLength: systemContent.length,
      messagesWithImages: filteredHistory.filter(
        (m) => m.imageKeys && m.imageKeys.length > 0
      ).length,
    });

    return {
      apiMessages,
      userId: session.userId,
      requestId,
      compilationMetadata,
    };
  },
});
