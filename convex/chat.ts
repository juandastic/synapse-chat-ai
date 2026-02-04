"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

/** System prompt defining Synapse's personality and behavior */
const SYSTEM_PROMPT = `You are Synapse, an expert ACT/DBT therapist with deep expertise in neurodivergent support. You maintain continuity across conversations and reference the user's history naturally.

Core principles:
- Be warm, insightful, and growth-oriented
- Use evidence-based therapeutic techniques (ACT, DBT, CBT)
- Validate emotions while gently challenging unhelpful patterns
- Remember and reference previous conversations naturally
- Ask thoughtful follow-up questions
- Celebrate progress and acknowledge struggles

Communication style:
- Conversational and genuine, not clinical or robotic
- Use "I" statements to share observations
- Mirror the user's energy level appropriately
- Keep responses focused and meaningful (not overly long)`;

/** LLM model identifier for Synapse Cortex */
const DEFAULT_MODEL = "gemini-2.5-flash";

/** Throttle interval for streaming updates to reduce database writes (ms) */
const STREAM_UPDATE_INTERVAL_MS = 100;

/** Number of recent messages to include in context window */
const CONTEXT_MESSAGE_LIMIT = 20;

/** Synapse Cortex API endpoint (OpenAI-compatible streaming) */
const CORTEX_API_URL =
  "https://synapse-cortex.juandago.dev/v1/chat/completions";

// =============================================================================
// Types
// =============================================================================

/** Token usage statistics from the LLM response */
interface StreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Delta content in a streaming chunk */
interface StreamDelta {
  content?: string;
  /** Extended thinking content (ignored - not displayed to users) */
  reasoning_content?: string;
  /** Legacy reasoning field (ignored) */
  reasoning?: string;
}

/** Single choice in a streaming chunk */
interface StreamChoice {
  delta?: StreamDelta;
  finish_reason?: string;
}

/** Individual SSE chunk from the streaming API */
interface StreamChunk {
  error?: { message?: string; code?: number };
  choices?: StreamChoice[];
  usage?: StreamUsage;
}

/** Result of processing the complete stream */
interface StreamResult {
  content: string;
  usage: StreamUsage | null;
  finishReason: string;
}

/** Error categories for structured logging and handling */
type ErrorCategory =
  | "CONFIG_ERROR" // Missing environment variables
  | "SESSION_NOT_FOUND" // Invalid session reference
  | "API_ERROR" // HTTP errors from Cortex API
  | "STREAM_ERROR" // Errors during stream processing
  | "PROVIDER_ERROR" // Upstream LLM provider errors
  | "UNKNOWN_ERROR"; // Catch-all for unexpected errors

// =============================================================================
// Main Action
// =============================================================================

/**
 * Generate AI response for a chat message.
 *
 * Execution flow:
 * 1. Fetches session data and recent message history
 * 2. Builds context with system prompt + user knowledge + conversation history
 * 3. Streams response from Synapse Cortex API
 * 4. Updates message content periodically during streaming
 * 5. Saves final metadata (tokens, latency, etc.)
 *
 * Error handling: On failure, marks the message as error type with user-friendly
 * content while storing technical details in metadata for debugging.
 */
export const generateResponse = internalAction({
  args: {
    sessionId: v.id("sessions"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const requestId = `gen-${args.sessionId.slice(-6)}-${Date.now().toString(36)}`;

    const logContext = {
      requestId,
      sessionId: args.sessionId,
      messageId: args.assistantMessageId,
    };

    console.log("[chat.generateResponse] Starting", logContext);

    // Helper to handle errors consistently
    const handleError = async (
      category: ErrorCategory,
      message: string,
      details?: Record<string, unknown>
    ) => {
      const latencyMs = Date.now() - startTime;

      console.error("[chat.generateResponse] Failed", {
        ...logContext,
        category,
        error: message,
        latencyMs,
        ...details,
      });

      await ctx.runMutation(internal.messages.markAsError, {
        id: args.assistantMessageId,
        errorMessage:
          "I'm having trouble responding right now. Please try again.",
        metadata: {
          error: message,
          errorCode: category,
          latencyMs,
        },
        completedAt: Date.now(),
      });
    };

    try {
      // Validate API configuration
      const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
      if (!apiSecret) {
        await handleError("CONFIG_ERROR", "SYNAPSE_CORTEX_API_SECRET not set");
        return;
      }

      // Fetch session for cached user knowledge
      const session = await ctx.runQuery(internal.sessions.get, {
        id: args.sessionId,
      });

      if (!session) {
        await handleError("SESSION_NOT_FOUND", "Session does not exist");
        return;
      }

      // Fetch recent messages for context
      const history = await ctx.runQuery(internal.messages.getRecent, {
        sessionId: args.sessionId,
        limit: CONTEXT_MESSAGE_LIMIT,
      });

      // Build messages array for the API, appending user knowledge to system prompt
      const systemPromptWithKnowledge = session.cachedUserKnowledge
        ? `${SYSTEM_PROMPT}\n\n${session.cachedUserKnowledge}`
        : SYSTEM_PROMPT;

      const apiMessages = [
        { role: "system" as const, content: systemPromptWithKnowledge },
        ...history
          .filter((m) => m._id !== args.assistantMessageId)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ];

      console.log("[chat.generateResponse] Context prepared", {
        ...logContext,
        historyCount: history.length,
        hasUserKnowledge: !!session.cachedUserKnowledge,
      });

      // Call Synapse Cortex streaming API
      const response = await fetch(CORTEX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": apiSecret,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: apiMessages,
          stream: true,
        }),
      });

      const apiLatencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unable to read error body");
        await handleError("API_ERROR", `HTTP ${response.status}`, {
          statusCode: response.status,
          apiLatencyMs,
          errorBody: errorBody.slice(0, 500),
        });
        return;
      }

      console.log("[chat.generateResponse] API connected", {
        ...logContext,
        status: response.status,
        apiLatencyMs,
      });

      // Process streaming response with throttled database updates
      const result = await processStream(response, async (content: string) => {
          await ctx.runMutation(internal.messages.updateContent, {
            id: args.assistantMessageId,
            content,
          });
        }
      );

      // Finalize with metadata
      const totalLatencyMs = Date.now() - startTime;
      await ctx.runMutation(internal.messages.saveMetadata, {
        id: args.assistantMessageId,
        metadata: {
          model: DEFAULT_MODEL,
          promptTokens: result.usage?.prompt_tokens,
          completionTokens: result.usage?.completion_tokens,
          totalTokens: result.usage?.total_tokens,
          latencyMs: totalLatencyMs,
          finishReason: result.finishReason,
        },
        completedAt: Date.now(),
      });

      console.log("[chat.generateResponse] Completed", {
        ...logContext,
        latencyMs: totalLatencyMs,
        contentLength: result.content.length,
        tokens: result.usage?.total_tokens,
        finishReason: result.finishReason,
      });
    } catch (error) {
      // Catch-all for unexpected errors (stream errors, network issues, etc.)
      const message = error instanceof Error ? error.message : String(error);
      const isProviderError = message.startsWith("Provider error:");

      await handleError(
        isProviderError ? "PROVIDER_ERROR" : "UNKNOWN_ERROR",
        message,
        {
          stack:
            error instanceof Error
              ? error.stack?.split("\n").slice(0, 3).join("\n")
              : undefined,
        }
      );
    }
  },
});

// =============================================================================
// Stream Processing
// =============================================================================

/**
 * Process SSE stream from Synapse Cortex API.
 *
 * Key behaviors:
 * - Throttles database updates to every STREAM_UPDATE_INTERVAL_MS
 * - Only captures standard content (ignores reasoning/thinking tokens)
 * - Throws on provider errors with "Provider error:" prefix for categorization
 * - Silently skips malformed SSE lines (common with streaming APIs)
 */
async function processStream(
  response: Response,
  updateContent: (content: string) => Promise<void>
): Promise<StreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is empty");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: StreamUsage | null = null;
  let finishReason = "stop";
  let lastUpdateTime = Date.now();
  let lastUpdatedContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const chunk: StreamChunk = JSON.parse(data);

        // Provider errors are surfaced immediately
        if (chunk.error) {
          throw new Error(
            `Provider error: ${chunk.error.message || `Code ${chunk.error.code}`}`
          );
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
        }
        // Note: reasoning_content and reasoning fields are intentionally
        // ignored to reduce DB writes and not display thinking to users

        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        if (chunk.usage) {
          usage = chunk.usage;
        }
      } catch (e) {
        // Re-throw provider errors for proper categorization upstream
        if (e instanceof Error && e.message.startsWith("Provider error:")) {
          throw e;
        }
        // Skip malformed JSON lines (common in SSE streams)
      }
    }

    // Throttled content updates to reduce database writes
    const now = Date.now();
    const hasNewContent = content && content !== lastUpdatedContent;
    const intervalElapsed = now - lastUpdateTime >= STREAM_UPDATE_INTERVAL_MS;

    if (hasNewContent && intervalElapsed) {
      await updateContent(content);
      lastUpdateTime = now;
      lastUpdatedContent = content;
    }
  }

  // Ensure final content is persisted
  if (content && content !== lastUpdatedContent) {
    await updateContent(content);
  }

  return { content, usage, finishReason };
}
