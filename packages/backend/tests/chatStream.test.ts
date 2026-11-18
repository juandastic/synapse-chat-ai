import { expect, it, vi } from "vitest";
import { api, chatFixture } from "./helpers";

const capturedEvents = vi.hoisted(
  () => [] as Array<{ event: string; properties?: Record<string, unknown> }>,
);

// Telemetry is an external boundary. Context, auth, persistence and usage stay real.
vi.mock("posthog-node", () => ({
  PostHog: class {
    async captureImmediate(event: {
      event: string;
      properties?: Record<string, unknown>;
    }) {
      capturedEvents.push(event);
    }
    async shutdown() {}
  },
}));

async function runStream(
  model: "gemini-3.1-pro-preview" | "gemini-4-argon" | "openai/gpt-6.1-sol",
  responses: Array<string | Uint8Array[]>,
) {
  capturedEvents.length = 0;
  vi.stubEnv("SYNAPSE_CORTEX_API_SECRET", "test-secret");
  const f = await chatFixture({ chatModel: model });
  const turn = await f.send();
  await f.t.run((ctx) =>
    ctx.db.insert("user_knowledge_cache", {
      userId: f.userId,
      cachedUserKnowledge: "Memory",
      cacheName: "cachedContents/vertex",
      lastUpdatedAt: Date.now(),
    }),
  );
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      const body = responses[requests.length - 1];
      if (body === undefined) throw new Error("Unexpected fallback call");
      return new Response(
        typeof body === "string"
          ? body
          : new ReadableStream({
              start(controller) {
                body.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
              },
            }),
      );
    }),
  );
  const response = await f.owner.fetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      threadId: f.threadId,
      sessionId: turn.sessionId,
      assistantMessageId: turn.assistantMessageId,
    }),
  });
  const text = await response.text();
  const message = await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId));
  return { ...f, requests, text, message, turn, events: [...capturedEvents] };
}
const failure =
  'data: {"error":{"message":"Provider unavailable","code":502}}\n\n';
const success =
  'data: {"model":"gemini-3-flash-preview","choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n' +
  "data: [DONE]\n\n";

const stageUsage = {
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  thoughts_tokens: 10,
  cached_tokens: 0,
  cost: 0.01,
};
const consultation = {
  policy_version: "v1",
  status: "consulted",
  trace_id: "cortex-trace-123",
  category: "medical",
  probability: 0.98,
  model: "openai/gpt-6-luna",
  reasoning_effort: "low",
  search_used: true,
  search_requests: 1,
  sources: [
    {
      title: "FDA",
      url: "https://www.fda.gov/caffeine",
      provenance: "model_link",
    },
  ],
  routing_ms: 300,
  advice_ms: 10000,
  known_cost_usd: 0.04,
  cost_complete: true,
  stages: {
    routing: stageUsage,
    draft: stageUsage,
    advice: stageUsage,
    published: stageUsage,
  },
};

function consultationStream(value: unknown) {
  return (
    'data: {"choices":[{"delta":{"content":"Respuesta final"}}]}\n\n' +
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 400,
        completion_tokens: 80,
        total_tokens: 480,
        cost: 0.04,
        consultation: value,
      },
    })}\n\n` +
    "data: [DONE]\n\n"
  );
}

it("persists consultation trace privately and accounts total turn usage once", async () => {
  const result = await runStream("gemini-3.1-pro-preview", [
    consultationStream(consultation),
  ]);
  expect(result.text).toBe("Respuesta final");
  expect(result.message?.metadata?.consultation).toEqual(consultation);
  expect(result.message?.metadata?.totalTokens).toBe(480);
  const visible = await result.owner.query(api.messages.list, {
    threadId: result.threadId,
  });
  const reply = visible.find(
    (message) => message._id === result.turn.assistantMessageId,
  );
  expect(reply).toBeDefined();
  expect(reply).not.toHaveProperty("metadata.consultation");
  const usage = await result.t.run((ctx) =>
    ctx.db.query("monthly_usage").first(),
  );
  expect(usage).toMatchObject({
    totalChatMessages: 1,
    totalInputTokens: 400,
    totalOutputTokens: 80,
  });
  const event = result.events.find((item) => item.event === "message sent");
  expect(event?.properties).toMatchObject({
    consultation_status: "consulted",
    consultation_model: "openai/gpt-6-luna",
    consultation_source_count: 1,
    consultation_search_used: true,
    consultation_search_requests: 1,
    cortex_trace_id: "cortex-trace-123",
    $ai_trace_id: "cortex-trace-123",
    consultation_known_cost_usd: 0.04,
    consultation_cost_complete: true,
  });
});

it("preserves consultation failure trace and charges reported usage for partial answers", async () => {
  const partialConsultation = {
    ...consultation,
    status: "final_failed_partial",
    error_type: "RuntimeError",
  };
  const result = await runStream("gemini-3.1-pro-preview", [
    'data: {"choices":[{"delta":{"content":"Respuesta parcial"}}]}\n\n' +
      `data: ${JSON.stringify({
        error: { message: "Final generation interrupted", code: 502 },
        usage: {
          prompt_tokens: 400,
          completion_tokens: 80,
          total_tokens: 480,
          cost: 0.04,
          consultation: partialConsultation,
        },
      })}\n\n`,
  ]);
  expect(result.text).toBe("Respuesta parcial");
  expect(result.message?.metadata?.consultation).toEqual(partialConsultation);
  expect(result.message?.metadata?.finishReason).toBe("error");
  const usage = await result.t.run((ctx) =>
    ctx.db.query("monthly_usage").first(),
  );
  expect(usage).toMatchObject({
    totalChatMessages: 1,
    totalInputTokens: 400,
    totalOutputTokens: 80,
  });
  expect(
    result.events.find((item) => item.event === "message generation failed")
      ?.properties,
  ).toMatchObject({
    consultation_status: "final_failed_partial",
    cortex_trace_id: "cortex-trace-123",
    $ai_trace_id: "cortex-trace-123",
  });
});

it.each([
  { ...consultation, status: "unknown" },
  { ...consultation, probability: 1.5 },
  { ...consultation, search_used: "true" },
  { ...consultation, stages: { advice: { ...stageUsage, cost: "free" } } },
  { ...consultation, sources: [{ title: "Bad", url: "javascript:alert(1)" }] },
  { ...consultation, extra_untrusted_field: "discard me" },
  null,
])(
  "malformed consultation metadata never prevents the final answer from persisting",
  async (value) => {
    const result = await runStream("gemini-3.1-pro-preview", [
      consultationStream(value),
    ]);
    expect(result.text).toBe("Respuesta final");
    expect(result.message?.type).toBe("text");
    expect(result.message?.metadata).not.toHaveProperty("consultation");
    expect(result.message?.metadata?.totalTokens).toBe(480);
  },
);

it("OpenRouter failures are recorded without any Gemini fallback or cache ID", async () => {
  const result = await runStream("openai/gpt-6.1-sol", [failure]);
  expect(result.requests).toHaveLength(1);
  expect(result.requests[0]).toMatchObject({
    model: "openai/gpt-6.1-sol",
    provider: "openrouter",
    compilation: "Memory",
  });
  expect(result.requests[0]).not.toHaveProperty("cache_name");
  expect(result.message).toMatchObject({
    type: "error",
    metadata: { errorCode: "PROVIDER_ERROR" },
  });
  expect(result.text).toBe("");
});

it("Gemini preserves its Flash fallback and cached-content request", async () => {
  const result = await runStream("gemini-3.1-pro-preview", [failure, success]);
  expect(result.requests.map((r) => r.model)).toEqual([
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
  ]);
  expect(result.requests[0].cache_name).toBe("cachedContents/vertex");
  expect(result.text).toBe("Hello");
  expect(result.message).toMatchObject({
    type: "text",
    content: "Hello",
    metadata: { usedFallback: true },
  });
});

it.each([
  { model: "openai/gpt-6.1-sol" as const, provider: "openrouter" },
  { model: "gemini-4-argon" as const, provider: "vertex" },
])(
  "$model output persists its model, provider, cost and RAG usage",
  async ({ model, provider }) => {
    const result = await runStream(model, [
      `data: {"model":"${model}","choices":[{"delta":{"content":"Answer"}}]}\n\n` +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"cost":0.01,"rag_enabled":true,"rag_nodes":3,"thoughts_tokens":42}}\n\n' +
        "data: [DONE]\n\n",
    ]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      model,
      provider,
      compilation: "Memory",
    });
    expect(result.message?.generationTarget).toEqual({ model, provider });
    expect(result.text).toBe("Answer");
    expect(result.message?.metadata).toMatchObject({
      provider,
      model,
      cost: 0.01,
      ragNodes: 3,
      thoughtsTokens: 42,
      usedFallback: false,
    });
  },
);

it("parses fragmented SSE and UTF-8 then records usage once", async () => {
  const bytes = new TextEncoder().encode(success.replace("Hello", "Hola 👋"));
  // One byte per chunk splits JSON lines, delimiters and multibyte characters.
  const result = await runStream("gemini-3.1-pro-preview", [
    Array.from(bytes, (byte) => new Uint8Array([byte])),
  ]);
  expect(result.text).toBe("Hola 👋");
  expect(result.message?.content).toBe("Hola 👋");
  expect(result.message?.metadata?.totalTokens).toBe(12);
  const usage = await result.t.run((ctx) =>
    ctx.db.query("monthly_usage").first(),
  );
  expect(usage).toMatchObject({
    totalChatMessages: 1,
    totalInputTokens: 10,
    totalOutputTokens: 2,
  });
});

it("preserves partial output when a provider fails after sending bytes and does not fallback", async () => {
  const result = await runStream("gemini-3.1-pro-preview", [
    success.split("\n\n")[0] + "\n\n" + failure,
  ]);
  expect(result.requests).toHaveLength(1);
  expect(result.text).toBe("Hello");
  expect(result.message).toMatchObject({
    content: "Hello",
    type: "text",
    metadata: { finishReason: "error", usedFallback: false },
  });
});

it("the HTTP endpoint rejects anonymous and foreign requests before calling Cortex", async () => {
  const f = await chatFixture();
  const turn = await f.send();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const init = {
    method: "POST",
    body: JSON.stringify({
      threadId: f.threadId,
      sessionId: turn.sessionId,
      assistantMessageId: turn.assistantMessageId,
    }),
  };
  expect((await f.t.fetch("/chat", init)).status).toBe(401);
  expect((await f.stranger.fetch("/chat", init)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
