import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_MODELS, getChatModel } from "../convex/chatModels";
import { getGenerationTarget, send, resend, list, getBySession } from "../convex/messages";

// Exercise the real registered handlers with a small database fixture.
function fixture() {
  const user = { _id: "user", name: "Owner", tokenIdentifier: "issuer|owner", plan: "unlimited", chatModel: undefined as string | undefined, modelSelectorEnabled: undefined as boolean | undefined };
  const thread = { _id: "thread", userId: "user" };
  const session = { _id: "session", userId: "user", threadId: "thread", status: "active",
    cachedSystemPrompt: "Persona", lastMessageAt: Date.now(), closerJobId: "job" };
  const message = { _id: "assistant", threadId: "thread", sessionId: "session", role: "assistant",
    generationTarget: { provider: "openrouter", model: "qwen/qwen3.8-max-0902" } };
  const documents = new Map<string, any>([["user", user], ["thread", thread], ["session", session], ["assistant", message]]);
  const inserted: any[] = [];
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "issuer|owner" }) },
    db: {
      get: async (id: string) => documents.get(id) ?? null,
      query: (table: string) => {
        const result: any = {
          withIndex: () => result, order: () => result,
          unique: async () => table === "users" ? user : null,
          first: async () => table === "sessions" ? session : message,
          take: async () => [...documents.values()].filter((document) => document.sessionId === session._id),
          collect: async () => table === "messages"
            ? [...documents.values()].filter((document) => document.sessionId === session._id)
            : [],
        };
        return result;
      },
      insert: async (_table: string, document: any) => { inserted.push(document); return `inserted-${inserted.length}`; },
      patch: async (id: string, values: any) => { Object.assign(documents.get(id), values); },
      delete: async (id: string) => { documents.delete(id); },
    },
    scheduler: { runAfter: async () => "job" },
  };
  return { ctx, user, documents, message, inserted };
}

const invoke = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const streamArgs = { sessionId: "session", threadId: "thread", assistantMessageId: "assistant", tokenIdentifier: "issuer|owner" };

test("catalog keeps Gemini default and rejects arbitrary model IDs", () => {
  assert.equal(getChatModel().provider, "vertex");
  assert.equal(CHAT_MODELS.length, 5);
  assert.ok(CHAT_MODELS.every((model) => model.images));
  assert.equal(getChatModel("qwen/qwen3.8-max-0902").reasoning, "high");
  assert.throws(() => getChatModel("qwen/qwen3.7-max"));
  assert.throws(() => getChatModel("deepseek/deepseek-v4-pro-0813"));
  assert.throws(() => getChatModel("openrouter/auto"));
});

test("stream resolves the saved choice rather than a request override", async () => {
  const { ctx } = fixture();
  const result = await invoke(getGenerationTarget, ctx, { ...streamArgs, model: "openai/gpt-6.1-sol" });
  assert.deepEqual(result, { provider: "openrouter", model: "qwen/qwen3.8-max-0902" });
});

test("historical messages with no saved choice keep Gemini", async () => {
  const { ctx, message } = fixture();
  delete (message as any).generationTarget;
  const result = await invoke(getGenerationTarget, ctx, streamArgs);
  assert.deepEqual(result, { provider: "vertex", model: "gemini-3.1-pro-preview" });
});

test("rejects another user's stream, mixed session IDs, user messages and completed generations", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.documents.get("user").tokenIdentifier = "issuer|other"; },
    (f: ReturnType<typeof fixture>) => { f.message.sessionId = "other-session"; },
    (f: ReturnType<typeof fixture>) => { f.message.role = "user"; },
    (f: ReturnType<typeof fixture>) => { (f.message as any).completedAt = Date.now(); },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(invoke(getGenerationTarget, f.ctx, streamArgs));
  }
});

test("users without a configuration keep the Gemini default through Vertex", async () => {
  const { ctx, inserted } = fixture();
  await invoke(send, ctx, { threadId: "thread", content: "Hello" });
  assert.deepEqual(inserted[1].generationTarget, { provider: "vertex", model: "gemini-3.1-pro-preview" });
});

test("sending an OpenRouter turn freezes that choice without changing the session", async () => {
  const { ctx, user, inserted } = fixture();
  user.modelSelectorEnabled = true;
  user.chatModel = "anthropic/claude-sonnet-5.5";
  await invoke(send, ctx, { threadId: "thread", content: "Hello" });
  assert.equal(user.chatModel, "anthropic/claude-sonnet-5.5");
  assert.deepEqual(inserted[1].generationTarget, { provider: "openrouter", model: "anthropic/claude-sonnet-5.5" });
  assert.equal(inserted[1].sessionId, "session");
});

test("retry preserves the original model when the composer selection changes", async () => {
  const { ctx, documents, message, inserted } = fixture();
  (message as any).completedAt = Date.now();
  documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1 });
  await invoke(resend, ctx, { userMessageId: "user-message" });
  assert.deepEqual(inserted[0].generationTarget, { provider: "openrouter", model: "qwen/qwen3.8-max-0902" });
});

test("vision-capable retries remain available with images in the session", async () => {
  const { ctx, documents, message, inserted } = fixture();
  Object.assign(message, { completedAt: Date.now(), generationTarget: { provider: "openrouter", model: "openai/gpt-6.1-sol" } });
  documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1, imageKeys: ["image.png"] });
  await invoke(resend, ctx, { userMessageId: "user-message" });
  assert.equal(documents.has("assistant"), false);
  assert.deepEqual(inserted[0].generationTarget, { provider: "openrouter", model: "openai/gpt-6.1-sol" });
});

// These handlers share the same authenticated owner fixture as messages.
import { getChatSettings, setChatModel, setUserChatConfig, me, ensureUser, updateProfile, confirmTerms, setMemoryIntroSeen } from "../convex/users";

test("new turns use the assignment regardless of selector visibility", async () => {
  for (const flag of [undefined, false, true]) {
    const { ctx, user, inserted } = fixture();
    user.chatModel = "qwen/qwen3.8-max-0902";
    user.modelSelectorEnabled = flag;
    await invoke(send, ctx, { threadId: "thread", content: "Hello" });
    assert.deepEqual(inserted[1].generationTarget, { provider: "openrouter", model: user.chatModel });
  }
});

test("hidden users cannot change their assignment or discover it through settings", async () => {
  const { ctx, user } = fixture();
  user.chatModel = "anthropic/claude-sonnet-5.5";
  assert.deepEqual(await invoke(getChatSettings, ctx, {}), { modelSelectorEnabled: false, model: null });
  await assert.rejects(invoke(setChatModel, ctx, { model: "openai/gpt-6.1-sol" }), /disabled/);
  assert.equal(user.chatModel, "anthropic/claude-sonnet-5.5");
});

test("manual choices persist and sending without an override uses that saved assignment", async () => {
  const { ctx, user, inserted } = fixture();
  user.modelSelectorEnabled = true;
  await invoke(setChatModel, ctx, { model: "moonshotai/kimi-k2.6" });
  assert.deepEqual(await invoke(getChatSettings, ctx, {}), { modelSelectorEnabled: true, model: "moonshotai/kimi-k2.6" });
  await invoke(send, ctx, { threadId: "thread", content: "Hello" });
  assert.equal(inserted[1].generationTarget.model, "moonshotai/kimi-k2.6");
  for (const model of ["openrouter/auto", "qwen/qwen3.7-max", "deepseek/deepseek-v4-pro-0813"]) {
    await assert.rejects(invoke(setChatModel, ctx, { model }), /Unsupported/);
  }
});

test("admin configuration preserves unspecified values and only permits active models", async () => {
  const { ctx, user } = fixture();
  await invoke(setUserChatConfig, ctx, { userId: "user", chatModel: "anthropic/claude-sonnet-5.5", modelSelectorEnabled: true });
  await invoke(setUserChatConfig, ctx, { userId: "user", modelSelectorEnabled: false });
  assert.equal(user.chatModel, "anthropic/claude-sonnet-5.5");
  assert.equal(user.modelSelectorEnabled, false);
  await assert.rejects(invoke(setUserChatConfig, ctx, { userId: "user", chatModel: "qwen/qwen3.7-max" }), /Unsupported/);
});

test("all public profile return paths redact the assignment and selector config", async () => {
  for (const completedFlags of [false, true]) {
    const { ctx, user } = fixture();
    Object.assign(user, { chatModel: "anthropic/claude-sonnet-5.5", modelSelectorEnabled: true,
      ...(completedFlags ? { termsConfirmedAt: 1, memoryIntroSeenAt: 1 } : {}) });
    for (const fn of [me, ensureUser, updateProfile, confirmTerms, setMemoryIntroSeen]) {
      const profile = await invoke(fn, ctx, { name: "Owner" });
      assert.equal(profile.name, "Owner");
      assert.equal("chatModel" in profile, false);
      assert.equal("modelSelectorEnabled" in profile, false);
    }
  }
});

test("public message lists hide internal identity, usage and errors but retain sources and recall", async () => {
  const { ctx, message } = fixture();
  Object.assign(message, { metadata: { model: "qwen/qwen3.8-max-0902", provider: "openrouter", cost: 0.1,
    error: "Provider qwen failed", ragEnabled: true, ragNodes: 2,
    groundingUsed: true, groundingSources: [{ title: "Source", uri: "https://example.com" }] } });
  const [visible] = await invoke(list, ctx, { threadId: "thread" });
  assert.equal("generationTarget" in visible, false);
  for (const field of ["model", "provider", "cost", "error"]) assert.equal(field in visible.metadata, false);
  assert.equal(visible.metadata.ragNodes, 2);
  assert.equal(visible.metadata.groundingSources[0].title, "Source");
  const [internalMessage] = await invoke(getBySession, ctx, { sessionId: "session" });
  assert.equal(internalMessage.generationTarget.model, "qwen/qwen3.8-max-0902");
  assert.equal(internalMessage.metadata.provider, "openrouter");
});

test("changing the assignment never rewrites the frozen target on stream or retry", async () => {
  const { ctx, user, documents, message, inserted } = fixture();
  user.chatModel = "anthropic/claude-sonnet-5.5";
  user.modelSelectorEnabled = true;
  assert.equal((await invoke(getGenerationTarget, ctx, streamArgs)).model, "qwen/qwen3.8-max-0902");
  Object.assign(message, { completedAt: Date.now() });
  documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1 });
  await invoke(resend, ctx, { userMessageId: "user-message" });
  assert.equal(inserted[0].generationTarget.model, "qwen/qwen3.8-max-0902");
  assert.equal(user.chatModel, "anthropic/claude-sonnet-5.5");
});
