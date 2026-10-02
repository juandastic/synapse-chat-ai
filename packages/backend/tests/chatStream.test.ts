import { expect, it, vi } from "vitest";
import { chatFixture } from "./helpers";

// Telemetry is an external boundary. Context, auth, persistence and usage stay real.
vi.mock("posthog-node", () => ({
  PostHog: class {
    async captureImmediate() {}
    async shutdown() {}
  },
}));

async function runStream(
  model: "gemini-3.1-pro-preview" | "openai/gpt-6.1-sol",
  responses: Array<string | Uint8Array[]>,
) {
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
  return { ...f, requests, text, message, turn };
}
const failure =
  'data: {"error":{"message":"Provider unavailable","code":502}}\n\n';
const success =
  'data: {"model":"gemini-3-flash-preview","choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n' +
  "data: [DONE]\n\n";

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

it("OpenRouter output persists effective model, provider, cost and RAG usage", async () => {
  const result = await runStream("openai/gpt-6.1-sol", [
    'data: {"model":"openai/gpt-6.1-sol","choices":[{"delta":{"content":"Answer"}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"cost":0.01,"rag_enabled":true,"rag_nodes":3,"thoughts_tokens":42}}\n\n' +
      "data: [DONE]\n\n",
  ]);
  expect(result.text).toBe("Answer");
  expect(result.message?.metadata).toMatchObject({
    provider: "openrouter",
    model: "openai/gpt-6.1-sol",
    cost: 0.01,
    ragNodes: 3,
    thoughtsTokens: 42,
    usedFallback: false,
  });
});

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
