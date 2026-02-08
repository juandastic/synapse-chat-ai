"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { r2 } from "./r2";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Reduce DB writes during streaming by batching updates */
const STREAM_UPDATE_INTERVAL_MS = 100;

const CONTEXT_MESSAGE_LIMIT = 20;

/** OpenAI-compatible streaming endpoint */
const CORTEX_API_URL =
  "https://synapse-cortex.juandago.dev/v1/chat/completions";

// =============================================================================
// Types
// =============================================================================

interface StreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface StreamDelta {
  content?: string;
  reasoning_content?: string; // thinking tokens — ignored
  reasoning?: string; // legacy reasoning field — ignored
}

interface StreamChoice {
  delta?: StreamDelta;
  finish_reason?: string;
}

interface StreamChunk {
  error?: { message?: string; code?: number };
  choices?: StreamChoice[];
  usage?: StreamUsage;
}

interface StreamResult {
  content: string;
  usage: StreamUsage | null;
  finishReason: string;
}

/** OpenAI vision-compatible content part */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ApiMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

type ErrorCategory =
  | "CONFIG_ERROR"
  | "SESSION_NOT_FOUND"
  | "API_ERROR"
  | "STREAM_ERROR"
  | "PROVIDER_ERROR"
  | "UNKNOWN_ERROR";

// =============================================================================
// Main Action
// =============================================================================

/**
 * Generate AI response for a chat message.
 *
 * Reads the session snapshot directly (no thread/persona lookups needed)
 * and streams the response from Synapse Cortex, updating the message
 * content periodically until complete.
 */
export const generateResponse = internalAction({
  args: {
    sessionId: v.id("sessions"),
    threadId: v.id("threads"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const requestId = `gen-${args.sessionId.slice(-6)}-${Date.now().toString(36)}`;

    const logContext = {
      requestId,
      sessionId: args.sessionId,
      threadId: args.threadId,
      messageId: args.assistantMessageId,
    };

    console.log("[chat.generateResponse] Starting", logContext);

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
      const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
      if (!apiSecret) {
        await handleError("CONFIG_ERROR", "SYNAPSE_CORTEX_API_SECRET not set");
        return;
      }

      const session = await ctx.runQuery(internal.sessions.get, {
        id: args.sessionId,
      });

      if (!session) {
        await handleError("SESSION_NOT_FOUND", "Session does not exist");
        return;
      }

      // Fetches across all sessions for the thread (cross-session continuity)
      const history = await ctx.runQuery(internal.messages.getRecent, {
        threadId: args.threadId,
        limit: CONTEXT_MESSAGE_LIMIT,
      });

      const now = new Date();
      const currentDateTime = now.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

      let systemContent = session.cachedSystemPrompt;
      systemContent += `\n\nCurrent date and time: ${currentDateTime}`;
      if (session.cachedUserKnowledge) {
        systemContent += `\n\n${session.cachedUserKnowledge}`;
      }

      // Convert image keys to signed R2 URLs for vision-capable models
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

          apiMessages.push({
            role: "user",
            content: parts,
          });
        } else {
          apiMessages.push({
            role: m.role as "user" | "assistant",
            content: m.content,
          });
        }
      }

      console.log("[chat.generateResponse] Context prepared", {
        ...logContext,
        historyCount: filteredHistory.length,
        hasUserKnowledge: !!session.cachedUserKnowledge,
        systemPromptLength: systemContent.length,
        messagesWithImages: filteredHistory.filter(
          (m) => m.imageKeys && m.imageKeys.length > 0
        ).length,
      });

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
        const errorBody = await response
          .text()
          .catch(() => "Unable to read error body");
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

      const result = await processStream(
        response,
        async (content: string) => {
          await ctx.runMutation(internal.messages.updateContent, {
            id: args.assistantMessageId,
            content,
          });
        }
      );

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
 * Process SSE stream. Throttles DB updates and ignores reasoning tokens.
 * Provider errors throw with "Provider error:" prefix for upstream categorization.
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

  try {
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

          if (chunk.error) {
            throw new Error(
              `Provider error: ${chunk.error.message || `Code ${chunk.error.code}`}`
            );
          }

          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
          }

          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
          }

          if (chunk.usage) {
            usage = chunk.usage;
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Provider error:")) {
            throw e;
          }
          // Malformed SSE lines are expected — skip silently
        }
      }

      const now = Date.now();
      const hasNewContent = content && content !== lastUpdatedContent;
      const intervalElapsed =
        now - lastUpdateTime >= STREAM_UPDATE_INTERVAL_MS;

      if (hasNewContent && intervalElapsed) {
        await updateContent(content);
        lastUpdateTime = now;
        lastUpdatedContent = content;
      }
    }

    if (content && content !== lastUpdatedContent) {
      await updateContent(content);
    }
  } finally {
    reader.releaseLock();
  }

  return { content, usage, finishReason };
}
