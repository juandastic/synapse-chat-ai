/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
export { api, internal };

export async function chatFixture(overrides: Partial<Doc<"users">> = {}) {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Owner",
      tokenIdentifier: "issuer|owner",
      plan: "unlimited",
      ...overrides,
    }),
  );
  const owner = t.withIdentity({ tokenIdentifier: "issuer|owner" });
  const stranger = t.withIdentity({ tokenIdentifier: "issuer|stranger" });
  const personaId = await t.run((ctx) =>
    ctx.db.insert("personas", {
      userId,
      name: "Coach",
      systemPrompt: "Help me plan",
      language: "en",
      icon: "C",
      isDefault: false,
    }),
  );
  const threadId = await owner.mutation(api.threads.create, { personaId });
  const send = (content = "Hello", imageKeys?: string[]) =>
    owner.mutation(api.messages.send, {
      threadId,
      content,
      ...(imageKeys ? { imageKeys } : {}),
    });
  const finish = (id: Doc<"messages">["_id"], content = "Answer") =>
    t.mutation(internal.messages.finalizeGeneration, {
      id,
      content,
      completedAt: Date.now(),
      metadata: { model: "gemini-3.1-pro-preview", totalTokens: 12 },
    });
  return { t, owner, stranger, userId, personaId, threadId, send, finish };
}
