import { describe, expect, it } from "vitest";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  getChatModel,
} from "../convex/chatModels";
import { api, internal, chatFixture } from "./helpers";

describe("model assignment and blind evaluation", () => {
  it("defaults historical turns to Gemini and rejects unapproved IDs", () => {
    expect(getChatModel()).toEqual(DEFAULT_CHAT_MODEL);
    expect(getChatModel("qwen/qwen3.8-max-0902").reasoning).toBe("high");
    for (const id of [
      "openrouter/auto",
      "qwen/qwen3.7-max",
      "deepseek/deepseek-v4-pro-0813",
    ]) {
      expect(() => getChatModel(id)).toThrow(/Unsupported/);
    }
    expect(CHAT_MODELS.every((model) => model.images)).toBe(true);
  });

  it.each([undefined, false, true])(
    "freezes the saved model when selector visibility is %s",
    async (modelSelectorEnabled) => {
      const f = await chatFixture({
        chatModel: "qwen/qwen3.8-max-0902",
        modelSelectorEnabled,
      });
      const turn = await f.send();
      await f.t.run((ctx) =>
        ctx.db.patch(f.userId, { chatModel: "anthropic/claude-sonnet-5.5" }),
      );
      expect(
        await f.t.query(internal.messages.getGenerationTarget, {
          sessionId: turn.sessionId,
          assistantMessageId: turn.assistantMessageId,
          threadId: f.threadId,
          tokenIdentifier: "issuer|owner",
        }),
      ).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-max-0902" });
      await f.finish(turn.assistantMessageId);
      const retry = await f.owner.mutation(api.messages.resend, {
        userMessageId: turn.userMessageId,
      });
      expect(
        (await f.t.run((ctx) => ctx.db.get(retry.assistantMessageId)))
          ?.generationTarget,
      ).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-max-0902" });
    },
  );

  it("historical placeholders without a target resolve to the default model", async () => {
    const f = await chatFixture();
    const turn = await f.send();
    await f.t.run((ctx) =>
      ctx.db.patch(turn.assistantMessageId, { generationTarget: undefined }),
    );
    expect(
      await f.t.query(internal.messages.getGenerationTarget, {
        sessionId: turn.sessionId,
        assistantMessageId: turn.assistantMessageId,
        threadId: f.threadId,
        tokenIdentifier: "issuer|owner",
      }),
    ).toEqual({
      provider: DEFAULT_CHAT_MODEL.provider,
      model: DEFAULT_CHAT_MODEL.id,
    });
  });

  it("keeps hidden assignments private and rejects manual changes", async () => {
    const f = await chatFixture({ chatModel: "anthropic/claude-sonnet-5.5" });
    expect(await f.owner.query(api.users.getChatSettings, {})).toEqual({
      modelSelectorEnabled: false,
      model: null,
    });
    await expect(
      f.owner.mutation(api.users.setChatModel, { model: "openai/gpt-6.1-sol" }),
    ).rejects.toThrow(/disabled/);
    for (const profile of [
      await f.owner.query(api.users.me, {}),
      await f.owner.mutation(api.users.ensureUser, {}),
      await f.owner.mutation(api.users.updateProfile, { name: "New name" }),
      await f.owner.mutation(api.users.confirmTerms, {}),
      await f.owner.mutation(api.users.setMemoryIntroSeen, {}),
    ]) {
      expect(profile).toHaveProperty("name");
      expect(profile).not.toHaveProperty("chatModel");
      expect(profile).not.toHaveProperty("modelSelectorEnabled");
    }
    expect((await f.t.run((ctx) => ctx.db.get(f.userId)))?.chatModel).toBe(
      "anthropic/claude-sonnet-5.5",
    );
  });

  it("persists a visible selection, rejects unsupported choices, and preserves partial admin updates", async () => {
    const f = await chatFixture({ modelSelectorEnabled: true });
    await f.owner.mutation(api.users.setChatModel, {
      model: "moonshotai/kimi-k2.6",
    });
    expect(await f.owner.query(api.users.getChatSettings, {})).toEqual({
      modelSelectorEnabled: true,
      model: "moonshotai/kimi-k2.6",
    });
    await expect(
      f.owner.mutation(api.users.setChatModel, { model: "openrouter/auto" }),
    ).rejects.toThrow(/Unsupported/);
    await f.t.mutation(internal.users.setUserChatConfig, {
      userId: f.userId,
      modelSelectorEnabled: false,
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.userId)))?.chatModel).toBe(
      "moonshotai/kimi-k2.6",
    );
    const turn = await f.send("What is in this photo?", ["photo.png"]);
    expect(
      (await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)))
        ?.generationTarget?.model,
    ).toBe("moonshotai/kimi-k2.6");
  });
});
