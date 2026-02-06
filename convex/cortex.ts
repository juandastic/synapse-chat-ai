"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

/** Synapse Cortex API base URL */
const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Types
// =============================================================================

/** Response from Cortex /ingest endpoint */
interface IngestResponse {
  success: boolean;
  userKnowledgeCompilation?: string;
  error?: string;
  code?: string;
}

/** Response from Cortex /hydrate endpoint */
interface HydrateResponse {
  success: boolean;
  userKnowledgeCompilation?: string;
  error?: string;
  code?: string;
}

/** Outcome categories for structured logging */
type IngestOutcome =
  | "SUCCESS" // New knowledge acquired
  | "NO_SESSION" // Session not found
  | "NO_API_SECRET" // Missing configuration
  | "NO_MESSAGES" // Empty session
  | "API_HTTP_ERROR" // HTTP error from Cortex
  | "API_LOGIC_ERROR" // Cortex returned error response
  | "CONTENT_BLOCKED" // Safety filter triggered
  | "NETWORK_ERROR" // Fetch/connection failure
  | "UNKNOWN_ERROR"; // Unexpected exception

// =============================================================================
// Internal Actions
// =============================================================================

/**
 * Hydrate user knowledge from Cortex (no processing, just retrieval).
 *
 * Called as a background action after session creation via scheduler.runAfter(0).
 * Fetches the current compiled knowledge from the Cortex /hydrate endpoint
 * (a cheap Cypher query on Neo4j, no AI processing) and patches the session.
 *
 * Graceful degradation: On failure, the session continues without knowledge.
 */
export const hydrate = internalAction({
  args: {
    userId: v.id("users"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const requestId = `hydrate-${args.sessionId.slice(-6)}-${Date.now().toString(36)}`;

    const logContext = {
      requestId,
      sessionId: args.sessionId,
      userId: args.userId,
    };

    console.log("[cortex.hydrate] Starting", logContext);

    // Validate configuration
    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.warn("[cortex.hydrate] SYNAPSE_CORTEX_API_SECRET not set", logContext);
      return;
    }

    try {
      const response = await fetch(`${CORTEX_API_URL}/hydrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": apiSecret,
        },
        body: JSON.stringify({
          userId: args.userId,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn("[cortex.hydrate] HTTP error", {
          ...logContext,
          statusCode: response.status,
          latencyMs,
          errorBody: errorBody.slice(0, 300),
        });
        return;
      }

      const data: HydrateResponse = await response.json();

      if (!data.success || !data.userKnowledgeCompilation) {
        console.warn("[cortex.hydrate] No knowledge returned", {
          ...logContext,
          latencyMs,
          error: data.error,
          code: data.code,
        });
        return;
      }

      // Patch the session with the retrieved knowledge
      await ctx.runMutation(internal.sessions.patchKnowledge, {
        sessionId: args.sessionId,
        knowledge: data.userKnowledgeCompilation,
      });

      console.log("[cortex.hydrate] Success", {
        ...logContext,
        latencyMs,
        knowledgeLength: data.userKnowledgeCompilation.length,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      console.warn("[cortex.hydrate] Failed", {
        ...logContext,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      // Graceful degradation: session continues without knowledge
    }
  },
});

/**
 * Ingest closed session to Synapse Cortex knowledge graph.
 *
 * Execution flow:
 * 1. Fetch session metadata and messages
 * 2. POST to Cortex /ingest endpoint
 * 3. Create draft session with returned knowledge compilation
 *
 * Graceful degradation: On any failure, the draft session inherits the
 * previous session's knowledge. This ensures accumulated intelligence
 * is never lost due to transient errors or API issues.
 */
export const ingestAndCreateDraft = internalAction({
  args: {
    closedSessionId: v.id("sessions"),
    userId: v.id("users"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const requestId = `cortex-${args.closedSessionId.slice(-6)}-${Date.now().toString(36)}`;

    const logContext = {
      requestId,
      sessionId: args.closedSessionId,
      userId: args.userId,
      threadId: args.threadId,
    };

    console.log("[cortex.ingestAndCreateDraft] Starting", logContext);

    // Helper: Create draft session and log outcome
    const finalize = async (
      knowledge: string | null,
      outcome: IngestOutcome,
      details?: Record<string, unknown>
    ) => {
      const latencyMs = Date.now() - startTime;

      await ctx.runMutation(internal.sessions.createDraftSession, {
        userId: args.userId,
        threadId: args.threadId,
        knowledge,
      });

      const logLevel = outcome === "SUCCESS" ? "log" : "warn";
      console[logLevel]("[cortex.ingestAndCreateDraft] Completed", {
        ...logContext,
        outcome,
        latencyMs,
        hasKnowledge: !!knowledge,
        knowledgeLength: knowledge?.length ?? 0,
        ...details,
      });
    };

    // Fetch session metadata (needed for both ingest and fallback)
    const session = await ctx.runQuery(internal.sessions.get, {
      id: args.closedSessionId,
    });

    if (!session) {
      console.error(
        "[cortex.ingestAndCreateDraft] Session not found",
        logContext
      );
      // Still create a draft so the thread isn't left without one
      await ctx.runMutation(internal.sessions.createDraftSession, {
        userId: args.userId,
        threadId: args.threadId,
        knowledge: null,
      });
      return;
    }

    // Fallback: preserve previous session's knowledge on any error
    const fallbackKnowledge = session.cachedUserKnowledge ?? null;

    // Validate configuration
    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      await finalize(fallbackKnowledge, "NO_API_SECRET");
      return;
    }

    try {
      // Fetch all messages from the closed session
      const messages = await ctx.runQuery(internal.messages.getBySession, {
        sessionId: args.closedSessionId,
      });

      if (messages.length === 0) {
        await finalize(fallbackKnowledge, "NO_MESSAGES");
        return;
      }

      // Build request payload
      const requestPayload = {
        userId: args.userId,
        sessionId: args.closedSessionId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: Math.floor(m._creationTime),
        })),
        metadata: {
          sessionStartedAt: Math.floor(session.startedAt),
          sessionEndedAt: Math.floor(session.endedAt ?? Date.now()),
          messageCount: messages.length,
        },
      };

      // Calculate payload size for debugging slow requests
      const payloadJson = JSON.stringify(requestPayload);
      const payloadSizeKb = Math.round(payloadJson.length / 1024);
      const totalContentLength = messages.reduce(
        (sum, m) => sum + m.content.length,
        0
      );

      console.log("[cortex.ingestAndCreateDraft] Sending request", {
        ...logContext,
        messageCount: messages.length,
        payloadSizeKb,
        totalContentLength,
      });

      // Call Cortex /ingest API (no timeout - ingestion can take minutes)
      const response = await fetch(`${CORTEX_API_URL}/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": apiSecret,
        },
        body: payloadJson,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        await finalize(fallbackKnowledge, "API_HTTP_ERROR", {
          statusCode: response.status,
          errorBody: errorBody.slice(0, 300),
        });
        return;
      }

      const data: IngestResponse = await response.json();

      // Handle API-level errors
      if (!data.success || !data.userKnowledgeCompilation) {
        const isContentBlocked =
          data.code === "GRAPH_PROCESSING_ERROR" &&
          data.error?.includes("Content blocked");

        await finalize(
          fallbackKnowledge,
          isContentBlocked ? "CONTENT_BLOCKED" : "API_LOGIC_ERROR",
          {
            errorCode: data.code,
            errorMessage: data.error?.slice(0, 200),
          }
        );
        return;
      }

      // Success: create draft with new knowledge
      await finalize(data.userKnowledgeCompilation, "SUCCESS", {
        messageCount: messages.length,
      });
    } catch (error) {
      // Categorize the error for logging
      const isNetworkError =
        error instanceof Error &&
        ("cause" in error || error.message.includes("fetch"));

      const errorDetails: Record<string, unknown> = {
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      // Extract fetch error details (Node.js includes cause)
      if (error instanceof Error && "cause" in error) {
        const cause = error.cause;
        if (cause instanceof Error) {
          errorDetails.causeMessage = cause.message;
          errorDetails.causeCode =
            "code" in cause ? (cause as { code?: string }).code : undefined;
        }
      }

      await finalize(
        fallbackKnowledge,
        isNetworkError ? "NETWORK_ERROR" : "UNKNOWN_ERROR",
        errorDetails
      );
    }
  },
});
