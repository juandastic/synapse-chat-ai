"use node";

import { v } from "convex/values";
import { ActionCtx, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { RETRY_DELAYS_MS } from "./cortexJobs";

// =============================================================================
// Configuration
// =============================================================================

const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Types
// =============================================================================

type ProcessorCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

interface IngestPayload {
  closedSessionId: Id<"sessions">;
  userId: Id<"users">;
  threadId: Id<"threads">;
}

interface CorrectionPayload {
  userId: Id<"users">;
  correctionText: string;
}

interface IngestResponse {
  success: boolean;
  userKnowledgeCompilation?: string;
  error?: string;
  code?: string;
}

interface CorrectionResponse {
  success: boolean;
  error: string | null;
  code: string | null;
}

// =============================================================================
// Processor Action
// =============================================================================

/**
 * Recursive job processor for async Cortex API calls.
 *
 * Called by the scheduler after a job is enqueued. On failure, schedules
 * itself again with increasing delay (slow backoff). On permanent failure,
 * creates a fallback draft session so the thread is never left broken.
 *
 * Error strategy:
 *   - Throws    → retryable (HTTP errors, network failures, API errors)
 *   - Returns   → non-retryable, handled gracefully (no messages, content blocked)
 */
export const processJob = internalAction({
  args: { jobId: v.id("cortex_jobs") },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    const job = await ctx.runQuery(internal.cortexJobs.get, {
      id: args.jobId,
    });

    if (!job || job.status === "completed" || job.status === "failed") {
      return;
    }

    const logCtx = {
      jobId: args.jobId,
      type: job.type,
      attempt: job.attempts,
    };

    await ctx.runMutation(internal.cortexJobs.updateStatus, {
      jobId: args.jobId,
      status: "processing",
    });

    try {
      if (job.type === "ingest") {
        await processIngest(ctx, job.payload as IngestPayload, logCtx);
      } else if (job.type === "correction") {
        await processCorrection(job.payload as CorrectionPayload, logCtx);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }

      await ctx.runMutation(internal.cortexJobs.updateStatus, {
        jobId: args.jobId,
        status: "completed",
      });

      console.log("[cortexProcessor] Completed", {
        ...logCtx,
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const nextAttempt = job.attempts + 1;

      console.warn("[cortexProcessor] Failed", {
        ...logCtx,
        errorMessage,
        nextAttempt,
        maxAttempts: job.maxAttempts,
      });

      if (nextAttempt >= job.maxAttempts) {
        await ctx.runMutation(internal.cortexJobs.updateStatus, {
          jobId: args.jobId,
          status: "failed",
          attempts: nextAttempt,
          lastError: errorMessage,
        });

        // Ensure the thread always has a usable session even on permanent failure
        if (job.type === "ingest") {
          await createFallbackDraft(ctx, job.payload as IngestPayload);
        }
      } else {
        const delay = RETRY_DELAYS_MS[nextAttempt] ?? 30 * 60_000;

        await ctx.runMutation(internal.cortexJobs.updateStatus, {
          jobId: args.jobId,
          status: "processing",
          attempts: nextAttempt,
          lastError: errorMessage,
          nextRetryAt: Date.now() + delay,
        });

        await ctx.scheduler.runAfter(
          delay,
          internal.cortexProcessor.processJob,
          { jobId: args.jobId }
        );
      }
    }
  },
});

// =============================================================================
// Job Handlers
// =============================================================================

/**
 * Ingest a closed session's messages into the Cortex knowledge graph.
 *
 * Non-retryable cases (returns gracefully):
 *   - Session deleted, no messages, content blocked by safety filter
 * Retryable cases (throws):
 *   - HTTP errors, network failures, API logic errors, missing config
 */
async function processIngest(
  ctx: ProcessorCtx,
  payload: IngestPayload,
  logCtx: Record<string, unknown>
): Promise<void> {
  const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
  if (!apiSecret) {
    throw new Error("SYNAPSE_CORTEX_API_SECRET not set");
  }

  const session = await ctx.runQuery(internal.sessions.get, {
    id: payload.closedSessionId,
  });

  if (!session) {
    // Session was deleted — create empty draft so thread isn't orphaned
    await createDraft(ctx, payload, null);
    return;
  }

  const fallbackKnowledge = session.cachedUserKnowledge ?? null;

  const messages = await ctx.runQuery(internal.messages.getBySession, {
    sessionId: payload.closedSessionId,
  });

  if (messages.length === 0) {
    await createDraft(ctx, payload, fallbackKnowledge);
    return;
  }

  const requestPayload = {
    userId: payload.userId,
    sessionId: payload.closedSessionId,
    messages: messages.map(
      (m: { role: string; content: string; _creationTime: number }) => ({
        role: m.role,
        content: m.content,
        timestamp: Math.floor(m._creationTime),
      })
    ),
    metadata: {
      sessionStartedAt: Math.floor(session.startedAt),
      sessionEndedAt: Math.floor(session.endedAt ?? Date.now()),
      messageCount: messages.length,
    },
  };

  const body = JSON.stringify(requestPayload);

  console.log("[cortexProcessor] Ingesting", {
    ...logCtx,
    messageCount: messages.length,
    payloadSizeKb: Math.round(body.length / 1024),
  });

  const response = await fetch(`${CORTEX_API_URL}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-SECRET": apiSecret,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Cortex /ingest HTTP ${response.status}: ${errorBody.slice(0, 300)}`
    );
  }

  const data: IngestResponse = await response.json();

  if (!data.success || !data.userKnowledgeCompilation) {
    // Content blocked by safety filter — not retryable, use fallback
    if (
      data.code === "GRAPH_PROCESSING_ERROR" &&
      data.error?.includes("Content blocked")
    ) {
      console.warn("[cortexProcessor] Content blocked, using fallback", logCtx);
      await createDraft(ctx, payload, fallbackKnowledge);
      return;
    }

    throw new Error(
      `Cortex /ingest error: ${data.code} - ${data.error?.slice(0, 200)}`
    );
  }

  await createDraft(ctx, payload, data.userKnowledgeCompilation);
}

/**
 * Send a natural-language correction to the Cortex graph.
 * All failures are retryable (throws on any error).
 */
async function processCorrection(
  payload: CorrectionPayload,
  logCtx: Record<string, unknown>
): Promise<void> {
  const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
  if (!apiSecret) {
    throw new Error("SYNAPSE_CORTEX_API_SECRET not set");
  }

  console.log("[cortexProcessor] Correcting", {
    ...logCtx,
    correctionLength: payload.correctionText.length,
  });

  const response = await globalThis.fetch(
    `${CORTEX_API_URL}/v1/graph/correction`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-SECRET": apiSecret,
      },
      body: JSON.stringify({
        group_id: payload.userId,
        correction_text: payload.correctionText,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Cortex /correction HTTP ${response.status}: ${errorBody.slice(0, 300)}`
    );
  }

  const data: CorrectionResponse = await response.json();

  if (!data.success) {
    throw new Error(
      `Cortex /correction error: ${data.code} - ${data.error ?? "Unknown"}`
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Shorthand: create a draft session with the given knowledge. */
async function createDraft(
  ctx: ProcessorCtx,
  payload: IngestPayload,
  knowledge: string | null
): Promise<void> {
  await ctx.runMutation(internal.sessions.createDraftSession, {
    userId: payload.userId,
    threadId: payload.threadId,
    knowledge,
  });
}

/**
 * Best-effort fallback: create a draft inheriting old knowledge
 * after permanent job failure so the thread stays usable.
 */
async function createFallbackDraft(
  ctx: ProcessorCtx,
  payload: IngestPayload
): Promise<void> {
  try {
    const session = await ctx.runQuery(internal.sessions.get, {
      id: payload.closedSessionId,
    });
    await createDraft(ctx, payload, session?.cachedUserKnowledge ?? null);
  } catch (error) {
    console.error("[cortexProcessor] Fallback draft failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
