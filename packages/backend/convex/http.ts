import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

import { CompilationMetadata, CORTEX_API_BASE_URL } from "./cortexConfig";
import { PromptMode } from "./prompts";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MODEL = "gemini-3.1-pro-preview";
const FALLBACK_MODEL = "gemini-3-flash-preview";
const CORTEX_CHAT_COMPLETIONS_URL = `${CORTEX_API_BASE_URL}/v1/chat/completions`;

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
    thoughts_tokens?: number | null;
    cached_tokens?: number | null;
    rag_enabled?: boolean;
    rag_nodes?: number | null;
    rag_edges?: number | null;
    rag_search_ms?: number | null;
    rag_context_chars?: number | null;
    cache_enabled?: boolean | null;
    cache_hit?: boolean | null;
    cache_fallback_triggered?: boolean | null;
    grounding_enabled?: boolean;
    grounding_used?: boolean;
    grounding_query_count?: number;
    grounding_source_count?: number;
    grounding_support_count?: number;
    grounding_search_entry_point?: string | null;
    grounding_sources?: Array<{ title: string; uri: string }>;
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
      systemInstruction: string;
      compilation?: string;
      cacheName?: string;
      userId: string;
      requestId: string;
      compilationMetadata?: CompilationMetadata;
      promptMode: PromptMode;
      promptFormatVersion?: string;
      productContractVersion?: string;
      voicePromptVersion?: string;
      personaPromptSource?: string;
    };

    try {
      context = await ctx.runAction(internal.chat.prepareContext, {
        sessionId: sessionId as never,
        assistantMessageId: assistantMessageId as never,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

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

    const {
      apiMessages,
      systemInstruction,
      compilation,
      cacheName,
      userId,
      requestId,
      compilationMetadata,
      promptMode,
      promptFormatVersion,
      productContractVersion,
      voicePromptVersion,
      personaPromptSource,
    } = context;

    // ── Validate API secret ──────────────────────────────────────────────
    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      console.error("[http /chat] SYNAPSE_CORTEX_API_SECRET not set");

      await ctx.runMutation(internal.messages.markAsError, {
        id: assistantMessageId as never,
        errorMessage:
          "I'm having trouble responding right now. Please try again.",
        metadata: {
          error: "SYNAPSE_CORTEX_API_SECRET not set",
          errorCode: "CONFIG_ERROR",
        },
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
      let usage: StreamChunk["usage"];
      let finishReason = "stop";
      let modelUsed = DEFAULT_MODEL;
      let usedFallback = false;
      let clientDisconnected = false;

      // Performs the fetch + SSE streaming for a given model.
      // Writes content chunks to the stream and returns the final usage stats.
      const attemptStream = async (
        model: string,
      ): Promise<StreamChunk["usage"]> => {
        const response = await fetch(CORTEX_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-SECRET": apiSecret,
          },
          body: JSON.stringify({
            model,
            // Send system_instruction and compilation as separate fields so
            // the server can leverage an active Gemini cache for the
            // compilation (~75% cheaper on repeated tokens) and fall back
            // transparently when the cache is missing or expired.
            system_instruction: systemInstruction,
            ...(compilation !== undefined && { compilation }),
            // cache_name is the Gemini CachedContent resource stored by the
            // client when Cortex returned it from /ingest/status or /hydrate.
            // The server uses it via cached_content on this request; if it
            // has expired server-side, Cortex falls back to inlining the
            // compilation from the same body and retries transparently.
            ...(cacheName !== undefined && { cache_name: cacheName }),
            messages: apiMessages,
            stream: true,
            user_id: userId,
            session_id: sessionId,
            ...(compilationMetadata !== undefined && { compilationMetadata }),
          }),
        });

        if (!response.ok) {
          const errorBody = await response
            .text()
            .catch(() => "Unable to read error body");
          throw new Error(
            `API error: HTTP ${response.status} — ${errorBody.slice(0, 500)}`,
          );
        }

        console.log("[http /chat] API connected", {
          requestId,
          model,
          status: response.status,
          apiLatencyMs: Date.now() - startTime,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body is empty");

        const decoder = new TextDecoder();
        let buffer = "";
        let localUsage: StreamChunk["usage"];

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
                    `Provider error: ${chunk.error.message || `Code ${chunk.error.code}`}`,
                  );
                }

                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                  content += delta.content;

                  if (!clientDisconnected) {
                    try {
                      await writer.write(encoder.encode(delta.content));
                    } catch {
                      clientDisconnected = true;
                      console.warn(
                        "[http /chat] Client disconnected, continuing generation server-side",
                        {
                          requestId,
                          contentLengthSoFar: content.length,
                        },
                      );
                    }
                  }
                }

                if (chunk.choices?.[0]?.finish_reason) {
                  finishReason = chunk.choices[0].finish_reason;
                }

                if (chunk.usage) {
                  localUsage = chunk.usage;
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

        return localUsage;
      };

      try {
        try {
          usage = await attemptStream(DEFAULT_MODEL);
          modelUsed = DEFAULT_MODEL;
        } catch (primaryError) {
          if (content.length > 0) {
            // Already streamed bytes — can't retry, re-throw to error handler
            throw primaryError;
          }

          const primaryMessage =
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError);

          console.warn(
            "[http /chat] Primary model failed, retrying with fallback",
            {
              requestId,
              primaryError: primaryMessage,
              fallbackModel: FALLBACK_MODEL,
            },
          );

          usage = await attemptStream(FALLBACK_MODEL);
          modelUsed = FALLBACK_MODEL;
          usedFallback = true;
        }

        // ── Single DB write — persist final content + metadata ───────────
        const totalLatencyMs = Date.now() - startTime;

        await ctx.runMutation(internal.messages.finalizeGeneration, {
          id: assistantMessageId as never,
          content,
          metadata: {
            model: modelUsed,
            usedFallback,
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens,
            thoughtsTokens: usage?.thoughts_tokens ?? undefined,
            cachedTokens: usage?.cached_tokens ?? undefined,
            ragEnabled: usage?.rag_enabled,
            ragNodes: usage?.rag_nodes ?? undefined,
            ragEdges: usage?.rag_edges ?? undefined,
            ragSearchMs: usage?.rag_search_ms ?? undefined,
            ragContextChars: usage?.rag_context_chars ?? undefined,
            groundingEnabled: usage?.grounding_enabled,
            groundingUsed: usage?.grounding_used,
            groundingQueryCount: usage?.grounding_query_count,
            groundingSourceCount: usage?.grounding_source_count,
            groundingSupportCount: usage?.grounding_support_count,
            groundingSearchEntryPoint:
              usage?.grounding_search_entry_point ?? undefined,
            groundingSources: usage?.grounding_sources,
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
          model: modelUsed,
          usedFallback,
          clientDisconnected,
          latencyMs: totalLatencyMs,
          contentLength: content.length,
          tokens: usage?.total_tokens,
          groundingEnabled: usage?.grounding_enabled,
          groundingUsed: usage?.grounding_used,
          groundingQueryCount: usage?.grounding_query_count,
          groundingSourceCount: usage?.grounding_source_count,
          groundingSearchEntryPointPresent: Boolean(
            usage?.grounding_search_entry_point,
          ),
          finishReason,
          promptMode,
        });

        // PostHog: track successful message generation
        try {
          await ctx.runAction(internal.analytics.capture, {
            distinctId: userId,
            event: "message sent",
            properties: {
              model: modelUsed,
              used_fallback: usedFallback,
              prompt_tokens: usage?.prompt_tokens,
              completion_tokens: usage?.completion_tokens,
              total_tokens: usage?.total_tokens,
              latency_ms: totalLatencyMs,
              finish_reason: finishReason,
              rag_enabled: usage?.rag_enabled ?? false,
              cache_enabled: usage?.cache_enabled ?? false,
              cache_hit: usage?.cache_hit ?? false,
              cache_fallback_triggered:
                usage?.cache_fallback_triggered ?? false,
              cached_tokens: usage?.cached_tokens ?? 0,
              grounding_enabled: usage?.grounding_enabled ?? false,
              grounding_used: usage?.grounding_used ?? false,
              grounding_query_count: usage?.grounding_query_count ?? 0,
              grounding_source_count: usage?.grounding_source_count ?? 0,
              grounding_support_count: usage?.grounding_support_count ?? 0,
              grounding_search_entry_point_present: Boolean(
                usage?.grounding_search_entry_point,
              ),
              thread_id: threadId,
              session_id: sessionId,
              prompt_mode: promptMode,
              prompt_format_version: promptFormatVersion,
              product_contract_version: productContractVersion,
              voice_prompt_version: voicePromptVersion,
              persona_prompt_source: personaPromptSource,
            },
          });
        } catch {
          // Analytics failure must never affect the user experience
        }

        // Re-hydrate when Cortex fell back because the Gemini cache expired.
        // Triggers a fresh cache creation so the next message in this session
        // doesn't also fall back (caches expire by wallclock, not usage).
        if (usage?.cache_fallback_triggered) {
          try {
            await ctx.scheduler.runAfter(0, internal.cortex.hydrate, {
              userId: userId as never,
              sessionId: sessionId as never,
            });
          } catch (scheduleError) {
            console.warn("[http /chat] Failed to schedule re-hydrate", {
              requestId,
              error:
                scheduleError instanceof Error
                  ? scheduleError.message
                  : String(scheduleError),
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isProviderError = message.startsWith("Provider error:");
        const latencyMs = Date.now() - startTime;

        console.error("[http /chat] Stream failed", {
          requestId,
          error: message,
          clientDisconnected,
          latencyMs,
          contentLength: content.length,
        });

        // PostHog: track generation failure
        try {
          await ctx.runAction(internal.analytics.capture, {
            distinctId: userId,
            event: "message generation failed",
            properties: {
              error_code: isProviderError ? "PROVIDER_ERROR" : "STREAM_ERROR",
              latency_ms: latencyMs,
              thread_id: threadId,
              session_id: sessionId,
              model: modelUsed,
              partial_content: content.length > 0,
            },
          });
        } catch {
          // Analytics failure must never affect the user experience
        }

        if (content) {
          // Save whatever content was accumulated before the error
          await ctx.runMutation(internal.messages.finalizeGeneration, {
            id: assistantMessageId as never,
            content,
            metadata: {
              model: modelUsed,
              usedFallback,
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
