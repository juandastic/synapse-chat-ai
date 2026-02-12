"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Error Helpers
// =============================================================================

/** Walk the .cause chain to extract the real error from Node fetch failures. */
function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [error.message];
  let current: unknown = (error as Error & { cause?: unknown }).cause;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const errno = (current as Error & { code?: string }).code;
    parts.push(errno ? `${current.message} [${errno}]` : current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }
  return parts.join(" → ");
}

// =============================================================================
// Types
// =============================================================================

interface HydrateResponse {
  success: boolean;
  userKnowledgeCompilation?: string;
  error?: string;
  code?: string;
}

// =============================================================================
// Internal Actions
// =============================================================================

/**
 * Hydrate user knowledge from Cortex (read-only, no AI processing).
 *
 * Fetches the current compiled knowledge from Cortex /hydrate — a cheap
 * Cypher query on Neo4j. Called as a background action right after session
 * creation so the first AI response already has memory context.
 *
 * Graceful degradation: on failure the session continues without knowledge.
 */
export const hydrate = internalAction({
  args: {
    userId: v.id("users"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.warn("[cortex.hydrate] SYNAPSE_CORTEX_API_SECRET not set");
      return;
    }

    try {
      let response: Response;
      try {
        response = await fetch(`${CORTEX_API_URL}/hydrate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-SECRET": apiSecret,
          },
          body: JSON.stringify({ userId: args.userId }),
        });
      } catch (fetchError) {
        console.warn("[cortex.hydrate] Network error", {
          latencyMs: Date.now() - startTime,
          error: extractErrorMessage(fetchError),
        });
        return;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "<unreadable>");
        console.warn("[cortex.hydrate] HTTP error", {
          statusCode: response.status,
          statusText: response.statusText,
          latencyMs: Date.now() - startTime,
          errorBody: errorBody.slice(0, 500),
        });
        return;
      }

      const data: HydrateResponse = await response.json();

      if (!data.success || !data.userKnowledgeCompilation) {
        console.warn("[cortex.hydrate] No knowledge returned", {
          latencyMs: Date.now() - startTime,
          error: data.error,
        });
        return;
      }

      await ctx.runMutation(internal.sessions.patchKnowledge, {
        sessionId: args.sessionId,
        knowledge: data.userKnowledgeCompilation,
      });

      console.log("[cortex.hydrate] Success", {
        latencyMs: Date.now() - startTime,
        knowledgeLength: data.userKnowledgeCompilation.length,
      });
    } catch (error) {
      console.warn("[cortex.hydrate] Failed", {
        latencyMs: Date.now() - startTime,
        error: extractErrorMessage(error),
      });
    }
  },
});
