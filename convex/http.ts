import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MODEL = "gemini-3-pro-preview";
const CORTEX_API_URL =
  "https://synapse-cortex.juandago.dev/v1/chat/completions";

// =============================================================================
// Types
// =============================================================================

interface StreamChunk {
  error?: { message?: string; code?: number };
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// =============================================================================
// CORS
// =============================================================================

function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// =============================================================================
// Router
// =============================================================================

const http = httpRouter();

http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }),
});

/**
 * Stream an AI response directly to the client via HTTP.
 *
 * The frontend calls this after creating the placeholder assistant message.
 * Chunks flow straight to the browser — zero DB writes during streaming.
 * A single atomic write at the end persists the final content + metadata.
 */
http.route({
  path: "/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = corsHeaders(request);

    // ── Auth ──────────────────────────────────────────────────────────────
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return new Response("Unauthorized", { status: 401, headers });
    }

    // ── Parse request ────────────────────────────────────────────────────
    let body: {
      sessionId: string;
      threadId: string;
      assistantMessageId: string;
    };
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400, headers });
    }

    const { sessionId, threadId, assistantMessageId } = body;
    if (!sessionId || !threadId || !assistantMessageId) {
      return new Response("Missing required fields", { status: 400, headers });
    }

    // ── Prepare context (Node.js action — resolves R2 image URLs) ────────
    let context: {
      apiMessages: Array<{
        role: string;
        content: string | Array<Record<string, unknown>>;
      }>;
      userId: string;
      requestId: string;
    };

    try {
      context = await ctx.runAction(
        internal.chat.prepareContext,
        {
          sessionId: sessionId as never,
          assistantMessageId: assistantMessageId as never,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error("[http /chat] Context preparation failed", {
        sessionId,
        error: message,
      });

      await ctx.runMutation(internal.messages.markAsError, {
        id: assistantMessageId as never,
        errorMessage:
          "I'm having trouble responding right now. Please try again.",
        metadata: { error: message, errorCode: "CONTEXT_ERROR" },
        completedAt: Date.now(),
      });

      return new Response("Context preparation failed", {
        status: 500,
        headers,
      });
    }

    const { apiMessages, userId, requestId } = context;

    // ── Validate API secret ──────────────────────────────────────────────
    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.error("[http /chat] SYNAPSE_CORTEX_API_SECRET not set");

      await ctx.runMutation(internal.messages.markAsError, {
        id: assistantMessageId as never,
        errorMessage:
          "I'm having trouble responding right now. Please try again.",
        metadata: { error: "SYNAPSE_CORTEX_API_SECRET not set", errorCode: "CONFIG_ERROR" },
        completedAt: Date.now(),
      });

      return new Response("Server configuration error", {
        status: 500,
        headers,
      });
    }

    // ── Set up streaming transport ───────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const startTime = Date.now();

    const streamData = async () => {
      let content = "";
      let usage: StreamChunk["usage"] = undefined;
      let finishReason = "stop";

      try {
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

        if (!response.ok) {
          const errorBody = await response
            .text()
            .catch(() => "Unable to read error body");
          throw new Error(
            `API error: HTTP ${response.status} — ${errorBody.slice(0, 500)}`
          );
        }

        console.log("[http /chat] API connected", {
          requestId,
          status: response.status,
          apiLatencyMs: Date.now() - startTime,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body is empty");

        const decoder = new TextDecoder();
        let buffer = "";

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
                  await writer.write(encoder.encode(delta.content));
                }

                if (chunk.choices?.[0]?.finish_reason) {
                  finishReason = chunk.choices[0].finish_reason;
                }

                if (chunk.usage) {
                  usage = chunk.usage;
                }
              } catch (e) {
                if (
                  e instanceof Error &&
                  e.message.startsWith("Provider error:")
                ) {
                  throw e;
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // ── Single DB write — persist final content + metadata ───────────
        const totalLatencyMs = Date.now() - startTime;

        await ctx.runMutation(internal.messages.finalizeGeneration, {
          id: assistantMessageId as never,
          content,
          metadata: {
            model: DEFAULT_MODEL,
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens,
            latencyMs: totalLatencyMs,
            finishReason,
          },
          completedAt: Date.now(),
        });

        // Best-effort usage tracking
        try {
          await ctx.runMutation(internal.usage.trackActivity, {
            userId: userId as never,
            type: "chat",
            metrics: {
              tokensIn: usage?.prompt_tokens ?? 0,
              tokensOut: usage?.completion_tokens ?? 0,
              chars: content.length,
              count: 1,
            },
          });
        } catch (trackingError) {
          console.warn("[http /chat] Usage tracking failed", {
            requestId,
            error:
              trackingError instanceof Error
                ? trackingError.message
                : String(trackingError),
          });
        }

        console.log("[http /chat] Completed", {
          requestId,
          latencyMs: totalLatencyMs,
          contentLength: content.length,
          tokens: usage?.total_tokens,
          finishReason,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const isProviderError = message.startsWith("Provider error:");
        const latencyMs = Date.now() - startTime;

        console.error("[http /chat] Stream failed", {
          requestId,
          error: message,
          latencyMs,
          contentLength: content.length,
        });

        if (content) {
          // Save whatever content was accumulated before the error
          await ctx.runMutation(internal.messages.finalizeGeneration, {
            id: assistantMessageId as never,
            content,
            metadata: {
              model: DEFAULT_MODEL,
              latencyMs,
              finishReason: "error",
            },
            completedAt: Date.now(),
          });
        } else {
          await ctx.runMutation(internal.messages.markAsError, {
            id: assistantMessageId as never,
            errorMessage:
              "I'm having trouble responding right now. Please try again.",
            metadata: {
              error: message,
              errorCode: isProviderError ? "PROVIDER_ERROR" : "STREAM_ERROR",
              latencyMs,
            },
            completedAt: Date.now(),
          });
        }
      } finally {
        try {
          await writer.close();
        } catch {
          // Connection already closed (tab navigated away) — expected
        }
      }
    };

    // Start streaming without awaiting — Convex keeps the action alive until writer.close()
    void streamData();

    return new Response(readable, {
      headers: {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

export default http;
