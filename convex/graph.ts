"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

/** Synapse Cortex API base URL */
const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Types
// =============================================================================

/** A node in the knowledge graph */
interface GraphNode {
  id: string;
  name: string;
  val: number;
  summary: string;
}

/** A directed relationship between two nodes */
interface GraphLink {
  source: string;
  target: string;
  label: string;
  fact: string | null;
}

/** Full graph payload returned by Cortex */
interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Response from the correction endpoint */
interface CorrectionResponse {
  success: boolean;
  error: string | null;
  code: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve the current authenticated user's ID from the action context.
 * Actions cannot access ctx.db directly, so we call an internal query.
 *
 * @returns The Convex user ID string
 * @throws Error if not authenticated or user not found
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
 * Fetch the user's knowledge graph from Synapse Cortex.
 *
 * Calls GET /v1/graph/{group_id} where group_id is the Convex userId.
 * Returns { nodes, links } for rendering in react-force-graph-2d.
 *
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
    } catch (error) {
      console.warn("[graph.fetch] Auth failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }

    const requestId = `graph-fetch-${userId.slice(-6)}-${Date.now().toString(36)}`;
    const logContext = { requestId, userId };

    console.log("[graph.fetch] Starting", logContext);

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.warn("[graph.fetch] SYNAPSE_CORTEX_API_SECRET not set", logContext);
      return empty;
    }

    try {
      const response = await globalThis.fetch(
        `${CORTEX_API_URL}/v1/graph/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: {
            "X-API-SECRET": apiSecret,
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn("[graph.fetch] HTTP error", {
          ...logContext,
          statusCode: response.status,
          latencyMs,
          errorBody: errorBody.slice(0, 300),
        });
        return empty;
      }

      const data: GraphResponse = await response.json();

      console.log("[graph.fetch] Success", {
        ...logContext,
        latencyMs,
        nodeCount: data.nodes?.length ?? 0,
        linkCount: data.links?.length ?? 0,
      });

      return {
        nodes: data.nodes ?? [],
        links: data.links ?? [],
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      console.warn("[graph.fetch] Failed", {
        ...logContext,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }
  },
});

/**
 * Submit a natural-language memory correction to Synapse Cortex.
 *
 * Calls POST /v1/graph/correction with { group_id, correction_text }.
 * Graphiti processes it as an episode: invalidates outdated edges
 * and creates new ones automatically.
 *
 * After success, the frontend should re-fetch the graph.
 */
export const correct = action({
  args: {
    correctionText: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; error?: string }> => {
    const startTime = Date.now();

    let userId: string;
    try {
      userId = await resolveUserId(ctx);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }

    const requestId = `graph-correct-${userId.slice(-6)}-${Date.now().toString(36)}`;
    const logContext = { requestId, userId };

    console.log("[graph.correct] Starting", {
      ...logContext,
      correctionLength: args.correctionText.length,
    });

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.warn(
        "[graph.correct] SYNAPSE_CORTEX_API_SECRET not set",
        logContext
      );
      return { success: false, error: "Service configuration error" };
    }

    try {
      const response = await globalThis.fetch(
        `${CORTEX_API_URL}/v1/graph/correction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-SECRET": apiSecret,
          },
          body: JSON.stringify({
            group_id: userId,
            correction_text: args.correctionText,
          }),
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn("[graph.correct] HTTP error", {
          ...logContext,
          statusCode: response.status,
          latencyMs,
          errorBody: errorBody.slice(0, 300),
        });
        return { success: false, error: "Failed to process correction" };
      }

      const data: CorrectionResponse = await response.json();

      if (!data.success) {
        console.warn("[graph.correct] API error", {
          ...logContext,
          latencyMs,
          error: data.error,
          code: data.code,
        });
        return {
          success: false,
          error: data.error ?? "Failed to process correction",
        };
      }

      console.log("[graph.correct] Success", {
        ...logContext,
        latencyMs,
      });

      return { success: true };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      console.warn("[graph.correct] Failed", {
        ...logContext,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Network error" };
    }
  },
});
