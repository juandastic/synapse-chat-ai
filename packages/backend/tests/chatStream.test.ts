import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import router from "../convex/http";

async function runStream(provider: "vertex" | "openrouter", responses: string[]) {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
  process.env.SYNAPSE_CORTEX_API_SECRET = "test-secret";
  const requests: any[] = [];
  const mutations: { name: string; args: any }[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init!.body as string));
    const response = responses[requests.length - 1];
    if (response === undefined) throw new Error("Unexpected fallback call");
    return new Response(response);
  };
  const target = provider === "vertex"
    ? { provider, model: "gemini-3.1-pro-preview" }
    : { provider, model: "openai/gpt-6.1-sol" };
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "issuer|owner" }) },
    runQuery: async () => target,
    runAction: async (fn: any) => getFunctionName(fn) === "chat:prepareContext" ? {
      apiMessages: [{ role: "user", content: "Hello" }],
      systemInstruction: "Persona", compilation: "Memory", cacheName: "cachedContents/vertex",
      userId: "user", requestId: "test", promptMode: "legacy",
    } : undefined,
    runMutation: async (fn: any, args: any) => { mutations.push({ name: getFunctionName(fn), args }); },
  };
  try {
    const handler = router.lookup("/chat", "POST")![0] as any;
    const response = await handler._handler(ctx, new Request("https://example.com/chat", {
      method: "POST", body: JSON.stringify({ threadId: "thread", sessionId: "session", assistantMessageId: "message" }),
    }));
    const text = await response.text();
    return { requests, mutations, text };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.SYNAPSE_CORTEX_API_SECRET;
    else process.env.SYNAPSE_CORTEX_API_SECRET = originalSecret;
  }
}

const failure = 'data: {"error":{"message":"Provider unavailable","code":502}}\n\n';
const success = 'data: {"model":"gemini-3-flash-preview","choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n' +
  'data: [DONE]\n\n';

test("OpenRouter failures are recorded without any Gemini fallback or cache ID", async () => {
  const result = await runStream("openrouter", [failure]);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].model, "openai/gpt-6.1-sol");
  assert.equal(result.requests[0].provider, "openrouter");
  assert.equal(result.requests[0].compilation, "Memory");
  assert.equal(result.requests[0].cache_name, undefined);
  assert.ok(result.mutations.some((mutation) => mutation.name === "messages:markAsError"));
  assert.equal(result.text, "");
});

test("Gemini preserves its existing Flash fallback and cached-content request", async () => {
  const result = await runStream("vertex", [failure, success]);
  assert.deepEqual(result.requests.map((request) => request.model), ["gemini-3.1-pro-preview", "gemini-3-flash-preview"]);
  assert.equal(result.requests[0].cache_name, "cachedContents/vertex");
  assert.equal(result.text, "Hello");
  const final = result.mutations.find((mutation) => mutation.name === "messages:finalizeGeneration")!;
  assert.equal(final.args.metadata.usedFallback, true);
});

test("OpenRouter output persists effective model, provider, cost and RAG usage", async () => {
  const result = await runStream("openrouter", [
    'data: {"model":"openai/gpt-6.1-sol","choices":[{"delta":{"content":"Answer"}}]}\n\n' +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"cost":0.01,"rag_enabled":true,"rag_nodes":3,"thoughts_tokens":42}}\n\n' +
    'data: [DONE]\n\n',
  ]);
  const final = result.mutations.find((mutation) => mutation.name === "messages:finalizeGeneration")!;
  assert.equal(result.text, "Answer");
  assert.equal(final.args.metadata.provider, "openrouter");
  assert.equal(final.args.metadata.model, "openai/gpt-6.1-sol");
  assert.equal(final.args.metadata.cost, 0.01);
  assert.equal(final.args.metadata.ragNodes, 3);
  assert.equal(final.args.metadata.thoughtsTokens, 42);
  assert.equal(final.args.metadata.usedFallback, false);
});
