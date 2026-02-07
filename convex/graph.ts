"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// =============================================================================
// Configuration
// =============================================================================

const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Types
// =============================================================================

interface GraphNode {
  id: string;
  name: string;
  val: number;
  summary: string;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  fact: string | null;
}

interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve the authenticated user's Convex ID from an action context.
 * Actions can't access ctx.db, so we bounce through an internal query.
 */
async function resolveUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }

  const user = await ctx.runQuery(internal.users.getByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user._id;
}

// =============================================================================
// Public Actions
// =============================================================================

/**
 * Fetch the user's knowledge graph for visualization.
 * Returns { nodes, links } for react-force-graph-2d.
 * Graceful degradation: returns empty graph on any failure.
 */
export const fetch = action({
  args: {},
  handler: async (ctx): Promise<GraphResponse> => {
    const startTime = Date.now();
    const empty: GraphResponse = { nodes: [], links: [] };

    let userId: string;
    try {
      userId = await resolveUserId(ctx);
    } catch {
      return empty;
    }

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.warn("[graph.fetch] SYNAPSE_CORTEX_API_SECRET not set");
      return empty;
    }

    try {
      const response = await globalThis.fetch(
        `${CORTEX_API_URL}/v1/graph/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: { "X-API-SECRET": apiSecret },
        }
      );

      if (!response.ok) {
        console.warn("[graph.fetch] HTTP error", {
          statusCode: response.status,
          latencyMs: Date.now() - startTime,
        });
        return empty;
      }

      const data: GraphResponse = await response.json();

      console.log("[graph.fetch] Success", {
        latencyMs: Date.now() - startTime,
        nodeCount: data.nodes?.length ?? 0,
        linkCount: data.links?.length ?? 0,
      });

      return {
        nodes: data.nodes ?? [],
        links: data.links ?? [],
      };
    } catch (error) {
      console.warn("[graph.fetch] Failed", {
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }
  },
});

/**
 * Enqueue a memory correction job.
 * Returns immediately — processing happens asynchronously via cortexProcessor.
 * The frontend tracks progress by subscribing to cortexJobs.getActiveByUser.
 */
export const correct = action({
  args: {
    correctionText: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; error?: string }> => {
    let userId: string;
    try {
      userId = await resolveUserId(ctx);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }

    await ctx.runMutation(internal.cortexJobs.enqueueCorrection, {
      userId: userId as Id<"users">,
      correctionText: args.correctionText,
    });

    return { success: true };
  },
});
