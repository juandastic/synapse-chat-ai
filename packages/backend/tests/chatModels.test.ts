import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_MODELS, getChatModel } from "../convex/chatModels";
import { getGenerationTarget, send, resend } from "../convex/messages";

// Exercise the real registered handlers with a small database fixture.
function fixture() {
  const user = { _id: "user", tokenIdentifier: "issuer|owner", plan: "unlimited" };
  const thread = { _id: "thread", userId: "user" };
  const session = { _id: "session", userId: "user", threadId: "thread", status: "active",
    cachedSystemPrompt: "Persona", lastMessageAt: Date.now(), closerJobId: "job" };
  const message = { _id: "assistant", threadId: "thread", sessionId: "session", role: "assistant",
    generationTarget: { provider: "openrouter", model: "qwen/qwen3.7-max" } };
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
          collect: async () => table === "messages"
            ? [...documents.values()].filter((document) => document.sessionId === session._id)
            : [],
        };
        return result;
      },
      insert: async (_table: string, document: any) => { inserted.push(document); return `inserted-${inserted.length}`; },
      patch: async () => {},
      delete: async (id: string) => { documents.delete(id); },
    },
    scheduler: { runAfter: async () => "job" },
  };
  return { ctx, documents, message, inserted };
}

const invoke = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const streamArgs = { sessionId: "session", threadId: "thread", assistantMessageId: "assistant", tokenIdentifier: "issuer|owner" };

test("catalog keeps Gemini default and rejects arbitrary model IDs", () => {
  assert.equal(getChatModel().provider, "vertex");
  assert.equal(CHAT_MODELS.length, 6);
  assert.throws(() => getChatModel("openrouter/auto"));
});

test("stream resolves the saved choice rather than a request override", async () => {
  const { ctx } = fixture();
  const result = await invoke(getGenerationTarget, ctx, { ...streamArgs, model: "openai/gpt-6.1-sol" });
  assert.deepEqual(result, { provider: "openrouter", model: "qwen/qwen3.7-max" });
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

test("sending without a model, as mobile does, freezes the current Gemini default", async () => {
  const { ctx, inserted } = fixture();
  await invoke(send, ctx, { threadId: "thread", content: "Hello" });
  assert.deepEqual(inserted[1].generationTarget, { provider: "vertex", model: "gemini-3.1-pro-preview" });
});

test("sending an OpenRouter turn freezes that choice without changing the session", async () => {
  const { ctx, inserted } = fixture();
  await invoke(send, ctx, { threadId: "thread", content: "Hello", model: "anthropic/claude-sonnet-5.5" });
  assert.deepEqual(inserted[1].generationTarget, { provider: "openrouter", model: "anthropic/claude-sonnet-5.5" });
  assert.equal(inserted[1].sessionId, "session");
});

test("retry preserves the original model when the composer selection changes", async () => {
  const { ctx, documents, message, inserted } = fixture();
  (message as any).completedAt = Date.now();
  documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1 });
  await invoke(resend, ctx, { userMessageId: "user-message" });
  assert.deepEqual(inserted[0].generationTarget, { provider: "openrouter", model: "qwen/qwen3.7-max" });
});

test("incompatible retries preserve the existing answer when the session contains images", async () => {
  for (const model of ["qwen/qwen3.7-max", "deepseek/deepseek-v4-pro-0813"]) {
    for (const override of [false, true]) {
      const { ctx, documents, message, inserted } = fixture();
      Object.assign(message, {
        content: "Original answer", completedAt: Date.now(),
        generationTarget: { provider: "openrouter", model: override ? "openai/gpt-6.1-sol" : model },
      });
      documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1 });
      documents.set("later-image", { _id: "later-image", role: "user", threadId: "thread", sessionId: "session", imageKeys: ["image.png"] });

      await assert.rejects(invoke(resend, ctx, {
        userMessageId: "user-message", ...(override ? { model } : {}),
      }), /does not support images/);
      assert.equal(documents.get("assistant"), message);
      assert.equal(documents.get("assistant").content, "Original answer");
      assert.equal(inserted.length, 0);
    }
  }
});

test("vision-capable retries remain available with images in the session", async () => {
  const { ctx, documents, message, inserted } = fixture();
  Object.assign(message, { completedAt: Date.now(), generationTarget: { provider: "openrouter", model: "openai/gpt-6.1-sol" } });
  documents.set("user-message", { _id: "user-message", role: "user", threadId: "thread", sessionId: "session", _creationTime: 1, imageKeys: ["image.png"] });
  await invoke(resend, ctx, { userMessageId: "user-message" });
  assert.equal(documents.has("assistant"), false);
  assert.deepEqual(inserted[0].generationTarget, { provider: "openrouter", model: "openai/gpt-6.1-sol" });
});
