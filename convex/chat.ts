"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

const SYSTEM_ROLE = `You are Synapse, an expert ACT/DBT therapist with deep expertise in neurodivergent support. You maintain continuity across conversations and reference the user's history naturally.

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

/** OpenRouter model to use (free tier) */
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";

/** How often to update the message during streaming (ms) */
const STREAM_UPDATE_INTERVAL_MS = 100;

/** OpenRouter API endpoint */
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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
  reasoning_content?: string;
  reasoning?: string;
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

// =============================================================================
// Main Action
// =============================================================================

// TODO: Optimoze the funtion calling based on https://stack.convex.dev/ai-chat-with-http-streaming

/**
 * Generate AI response for a chat message.
 * Scheduled by the sendMessage mutation via ctx.scheduler.runAfter(0, ...).
 * Streams the response and updates the message in the database.
 */
export const generateResponse = internalAction({
  args: {
    sessionId: v.id("sessions"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const requestId = `gen-${Date.now()}-${args.sessionId.slice(-8)}`;

    console.log(`[${requestId}] Starting generation`, {
      sessionId: args.sessionId,
      messageId: args.assistantMessageId,
    });

    try {
      // 1. Fetch session for cached user knowledge
      const session = await ctx.runQuery(internal.sessions.get, {
        id: args.sessionId,
      });

      if (!session) {
        throw new Error("Session not found");
      }

      // 2. Fetch recent messages for context
      const history = await ctx.runQuery(internal.messages.getRecent, {
        sessionId: args.sessionId,
        limit: 20,
      });

      // 3. Build the messages array for the API
      const systemPrompt = `${SYSTEM_ROLE}\n\n${session.cachedUserKnowledge}`;
      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...history
          .filter((m) => m._id !== args.assistantMessageId)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ];

      console.log(`[${requestId}] Context prepared`, {
        historyCount: history.length,
        totalMessages: apiMessages.length,
      });

      // 4. Call OpenRouter API
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY not configured");
      }

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://synapse.app",
          "X-Title": "Synapse AI Chat",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: apiMessages,
          stream: true,
        }),
      });

      console.log(`[${requestId}] API Response`, {
        status: response.status,
        latencyMs: Date.now() - startTime
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${requestId}] API error`, { status: response.status, error: errorText });
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      // 5. Process the streaming response (updates content every 100ms for real content only)
      const result = await processStream(
        response,
        requestId,
        async (content: string) => {
          await ctx.runMutation(internal.messages.updateContent, {
            id: args.assistantMessageId,
            content,
          });
        }
      );

      // 6. Save metadata and mark as completed
      const latencyMs = Date.now() - startTime;
      await ctx.runMutation(internal.messages.saveMetadata, {
        id: args.assistantMessageId,
        metadata: {
          model: DEFAULT_MODEL,
          promptTokens: result.usage?.prompt_tokens,
          completionTokens: result.usage?.completion_tokens,
          totalTokens: result.usage?.total_tokens,
          latencyMs,
          finishReason: result.finishReason,
        },
        completedAt: Date.now(),
      });

      console.log(`[${requestId}] Generation complete`, {
        latencyMs,
        contentLength: result.content.length,
        tokens: result.usage?.total_tokens,
        finishReason: result.finishReason,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const latencyMs = Date.now() - startTime;
      console.error(`[${requestId}] Generation failed`, { error: errorMessage });

      await ctx.runMutation(internal.messages.markAsError, {
        id: args.assistantMessageId,
        errorMessage: "I'm having trouble responding right now. Please try again.",
        metadata: {
          error: errorMessage,
          latencyMs,
        },
        completedAt: Date.now(),
      });
    }
  },
});

// =============================================================================
// Stream Processing
// =============================================================================

interface StreamResult {
  content: string;
  usage: StreamUsage | null;
  finishReason: string;
}

/**
 * Process the SSE stream from OpenRouter.
 * Updates the message periodically during streaming.
 * Only updates when there's actual content (ignores thinking/reasoning tokens).
 */
async function processStream(
  response: Response,
  requestId: string,
  updateContent: (content: string) => Promise<void>
): Promise<StreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
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

        // Check for provider errors
        if (chunk.error) {
          console.error(`[${requestId}] Provider error`, chunk.error);
          throw new Error(`Provider error: ${chunk.error.message || "Unknown"}`);
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta) {
          // Only capture standard content field (ignore reasoning/thinking tokens)
          if (delta.content) {
            content += delta.content;
          }
          // Note: reasoning_content and reasoning are intentionally ignored
          // to save function calls and not display thinking to users
        }

        // Capture finish reason
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Capture usage stats
        if (chunk.usage) {
          usage = chunk.usage;
        }
      } catch (e) {
        // Re-throw provider errors
        if (e instanceof Error && e.message.startsWith("Provider error:")) {
          throw e;
        }
        // Silently skip unparseable lines (common with SSE)
      }
    }

    // Only update if there's new content (not just thinking tokens)
    const now = Date.now();
    if (
      content &&
      content !== lastUpdatedContent &&
      now - lastUpdateTime >= STREAM_UPDATE_INTERVAL_MS
    ) {
      await updateContent(content);
      lastUpdateTime = now;
      lastUpdatedContent = content;
    }
  }

  return {
    content,
    usage,
    finishReason,
  };
}
