"use node";

import { v } from "convex/values";
import { ActionCtx, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  RETRY_DELAYS_MS,
  POLL_DELAYS_MS,
  MAX_POLL_ATTEMPTS,
} from "./cortexJobs";

// =============================================================================
// Configuration
// =============================================================================

const CORTEX_API_URL = "https://synapse-cortex.juandago.dev";

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Extract a detailed error message from any thrown value.
 *
 * Node's `fetch` (undici) throws `TypeError("fetch failed")` and hides the
 * real cause (DNS, TCP, TLS, timeout …) in a nested `.cause` chain. This
 * function walks the chain so logs always show actionable detail.
 */
function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts: string[] = [error.message];
  // Node fetch (undici) nests the real cause in error.cause
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

/**
 * Fetch wrapper that turns network-level errors into descriptive messages
 * including the URL and root cause. No timeout — these are background jobs
 * that can take as long as they need.
 */
async function cortexFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(
      `Cortex request to ${url} failed: ${extractErrorMessage(error)}`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

type ProcessorCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

interface IngestPayload {
  closedSessionId: Id<"sessions">;
  userId: Id<"users">;
  threadId: Id<"threads">;
  messageCount?: number;
  totalChars?: number;
}

interface CorrectionPayload {
  userId: Id<"users">;
  correctionText: string;
}

interface IngestAcceptedResponse {
  jobId: string;
  status: "processing" | "skipped";
  userKnowledgeCompilation?: string; // only when "skipped"
}

interface IngestStatusResponse {
  jobId: string;
  status: "processing" | "completed" | "failed";
  userKnowledgeCompilation?: string; // only when "completed"
  metadata?: IngestResponseMetadata; // only when "completed"
  error?: string; // only when "failed"
  code?: string; // only when "failed"
}

interface IngestResponseMetadata {
  model: string;
  processing_time_ms?: number;
  nodes_extracted?: number;
  edges_extracted?: number;
  episode_id?: string;
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
 * Job processor for async Cortex API calls.
 *
 * Called by the scheduler after a job is enqueued.
 * - Ingest: POSTs to /ingest (202 Accepted). If "processing", delegates
 *   to pollIngestStatus for async status polling. If "skipped", completes
 *   synchronously.
 * - Correction: POSTs to /correction synchronously.
 *
 * On POST failure, schedules itself again with increasing delay (slow backoff).
 * On permanent failure, creates a fallback draft session so the thread is never
 * left broken.
 *
 * Error strategy:
 *   - Throws    → retryable (HTTP errors, network failures, API errors)
 *   - Returns   → non-retryable, handled gracefully (no messages, skipped)
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
        const result = await processIngest(
          ctx,
          args.jobId,
          job.payload as IngestPayload,
          logCtx
        );
        if (result === "polling") {
          const delay = POLL_DELAYS_MS[0];
          await ctx.runMutation(internal.cortexJobs.updateStatus, {
            jobId: args.jobId,
            status: "processing",
            nextRetryAt: Date.now() + delay,
          });
          await ctx.scheduler.runAfter(
            delay,
            internal.cortexProcessor.pollIngestStatus,
            { jobId: args.jobId, pollAttempt: 0 }
          );
          return;
        }
      } else if (job.type === "correction") {
        await processCorrection(ctx, job.payload as CorrectionPayload, logCtx);
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
      const errorMessage = extractErrorMessage(error);
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

/**
 * Poll the Cortex ingest status endpoint for an async ingestion job.
 * Scheduled by processJob when POST /ingest returns status "processing".
 * Uses scheduler-driven linear intervals (5m first, then 10m each).
 *
 * Error strategy mirrors processJob: on transient failure (network, HTTP,
 * parse errors), advances to the next poll attempt instead of throwing.
 * This prevents Convex's limited auto-retries from leaving the job stuck
 * in "processing" state if the Cortex API is temporarily unavailable.
 */
export const pollIngestStatus = internalAction({
  args: {
    jobId: v.id("cortex_jobs"),
    pollAttempt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.cortexJobs.get, {
      id: args.jobId,
    });

    if (!job || job.status === "completed" || job.status === "failed") {
      return;
    }

    if (job.type !== "ingest") {
      return;
    }

    const payload = job.payload as IngestPayload;

    try {
      const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
      if (!apiSecret) {
        throw new Error("SYNAPSE_CORTEX_API_SECRET not set");
      }

      const url = `${CORTEX_API_URL}/ingest/status/${args.jobId}`;
      const response = await cortexFetch(url, {
        method: "GET",
        headers: {
          "X-API-SECRET": apiSecret,
        },
      });

      if (response.status === 404) {
        // Job removed or unknown — re-submit POST /ingest
        console.log("[cortexProcessor] Ingest status 404, re-submitting", {
          jobId: args.jobId,
          pollAttempt: args.pollAttempt,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.cortexProcessor.processJob,
          { jobId: args.jobId }
        );
        return;
      }

      if (!response.ok) {
        const errorBody = await response
          .text()
          .catch(() => "<unreadable body>");
        throw new Error(
          `Cortex /ingest/status HTTP ${response.status} ${response.statusText}: ${errorBody.slice(0, 500)}`
        );
      }

      const data: IngestStatusResponse = await response.json();

      if (data.status === "completed") {
        const knowledge = data.userKnowledgeCompilation ?? null;
        await createDraft(ctx, payload, knowledge);

        if (payload.totalChars !== undefined) {
          try {
            await ctx.runMutation(internal.usage.trackActivity, {
              userId: payload.userId,
              type: "ingest",
              metrics: { chars: payload.totalChars, count: 1 },
            });
          } catch (trackingError) {
            console.warn("[cortexProcessor] Ingest usage tracking failed", {
              jobId: args.jobId,
              error:
                trackingError instanceof Error
                  ? trackingError.message
                  : String(trackingError),
            });
          }
        }

        await ctx.runMutation(internal.cortexJobs.updateStatus, {
          jobId: args.jobId,
          status: "completed",
        });

        console.log("[cortexProcessor] Ingest polling completed", {
          jobId: args.jobId,
          pollAttempt: args.pollAttempt,
        });
        return;
      }

      if (data.status === "failed") {
        const errorMessage = `${data.code ?? "UNKNOWN"}: ${data.error ?? "Unknown error"}`;
        await ctx.runMutation(internal.cortexJobs.updateStatus, {
          jobId: args.jobId,
          status: "failed",
          lastError: errorMessage,
        });
        await createFallbackDraft(ctx, payload);
        console.warn("[cortexProcessor] Ingest failed via Cortex", {
          jobId: args.jobId,
          error: errorMessage,
        });
        return;
      }

      // status === "processing" — schedule next poll
      await scheduleNextPoll(ctx, args.jobId, args.pollAttempt, payload);
    } catch (error) {
      // Transient failure (network, HTTP, parse) — advance to next poll
      // instead of throwing, so the job doesn't get stuck in "processing"
      const errorMessage = extractErrorMessage(error);
      console.warn("[cortexProcessor] Poll error, scheduling next attempt", {
        jobId: args.jobId,
        pollAttempt: args.pollAttempt,
        errorMessage,
      });

      await scheduleNextPoll(
        ctx,
        args.jobId,
        args.pollAttempt,
        payload,
        errorMessage
      );
    }
  },
});

/**
 * Schedule the next poll attempt, or fail the job if all attempts exhausted.
 * Shared by the normal "still processing" path and the error recovery path.
 */
async function scheduleNextPoll(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">,
  jobId: Id<"cortex_jobs">,
  currentAttempt: number,
  payload: IngestPayload,
  lastError?: string
): Promise<void> {
  const nextAttempt = currentAttempt + 1;

  if (nextAttempt >= MAX_POLL_ATTEMPTS) {
    const errorMessage =
      lastError ?? "Ingest polling timeout: max attempts exceeded";
    await ctx.runMutation(internal.cortexJobs.updateStatus, {
      jobId,
      status: "failed",
      lastError: errorMessage,
    });
    await createFallbackDraft(ctx, payload);
    console.warn("[cortexProcessor] Ingest polling exhausted", {
      jobId,
      pollAttempt: currentAttempt,
      reason: lastError ? "error" : "timeout",
    });
    return;
  }

  const delay = POLL_DELAYS_MS[nextAttempt] ?? 10 * 60_000;
  await ctx.runMutation(internal.cortexJobs.updateStatus, {
    jobId,
    status: "processing",
    ...(lastError !== undefined && { lastError }),
    nextRetryAt: Date.now() + delay,
  });

  await ctx.scheduler.runAfter(
    delay,
    internal.cortexProcessor.pollIngestStatus,
    { jobId, pollAttempt: nextAttempt }
  );

  console.log("[cortexProcessor] Next poll scheduled", {
    jobId,
    pollAttempt: nextAttempt,
    delayMs: delay,
    ...(lastError !== undefined && { recoveredFrom: lastError }),
  });
}

// =============================================================================
// Job Handlers
// =============================================================================

/**
 * Ingest a closed session's messages into the Cortex knowledge graph.
 *
 * New async API: POST returns 202 with status "processing" or "skipped".
 * When "skipped", completes synchronously. When "processing", returns "polling"
 * and the caller schedules pollIngestStatus.
 *
 * Non-retryable cases (returns gracefully):
 *   - Session deleted, no messages
 * Retryable cases (throws):
 *   - HTTP errors, network failures, API logic errors, missing config
 */
async function processIngest(
  ctx: ProcessorCtx,
  jobId: Id<"cortex_jobs">,
  payload: IngestPayload,
  logCtx: Record<string, unknown>
): Promise<"completed" | "polling"> {
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
    return "completed";
  }

  const fallbackKnowledge = session.cachedUserKnowledge ?? null;

  const messages = await ctx.runQuery(internal.messages.getBySession, {
    sessionId: payload.closedSessionId,
  });

  if (messages.length === 0) {
    await createDraft(ctx, payload, fallbackKnowledge);
    return "completed";
  }

  const requestPayload = {
    jobId,
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

  const url = `${CORTEX_API_URL}/ingest`;
  const response = await cortexFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-SECRET": apiSecret,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `Cortex /ingest HTTP ${response.status} ${response.statusText}: ${errorBody.slice(0, 500)}`
    );
  }

  const data: IngestAcceptedResponse = await response.json();

  if (data.status === "skipped") {
    await createDraft(
      ctx,
      payload,
      data.userKnowledgeCompilation ?? fallbackKnowledge
    );
    // Track usage for skipped (best-effort)
    if (payload.totalChars !== undefined) {
      try {
        await ctx.runMutation(internal.usage.trackActivity, {
          userId: payload.userId,
          type: "ingest",
          metrics: { chars: payload.totalChars, count: 1 },
        });
      } catch (trackingError) {
        console.warn("[cortexProcessor] Ingest usage tracking failed", {
          ...logCtx,
          error:
            trackingError instanceof Error
              ? trackingError.message
              : String(trackingError),
        });
      }
    }
    return "completed";
  }

  // status === "processing" — poll for result
  console.log("[cortexProcessor] Ingest accepted, polling needed", logCtx);
  return "polling";
}

/**
 * Send a natural-language correction to the Cortex graph.
 * All failures are retryable (throws on any error).
 */
async function processCorrection(
  ctx: ProcessorCtx,
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

  const url = `${CORTEX_API_URL}/v1/graph/correction`;
  const response = await cortexFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-SECRET": apiSecret,
    },
    body: JSON.stringify({
      group_id: payload.userId,
      correction_text: payload.correctionText,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `Cortex /correction HTTP ${response.status} ${response.statusText}: ${errorBody.slice(0, 500)}`
    );
  }

  const data: CorrectionResponse = await response.json();

  if (!data.success) {
    throw new Error(
      `Cortex /correction error: ${data.code} - ${data.error ?? "Unknown"}`
    );
  }

  // Track correction usage (best-effort)
  try {
    await ctx.runMutation(internal.usage.trackActivity, {
      userId: payload.userId,
      type: "correction",
      metrics: { chars: payload.correctionText.length, count: 1 },
    });
  } catch (trackingError) {
    console.warn("[cortexProcessor] Correction usage tracking failed", {
      ...logCtx,
      error:
        trackingError instanceof Error
          ? trackingError.message
          : String(trackingError),
    });
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
