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
    expect(getChatModel().id).toBe("gemini-3.1-pro-preview");
    expect(CHAT_MODELS.map((model) => model.id)).toContain("gemini-4-argon");
    expect(CHAT_MODELS.map((model) => model.id)).not.toContain(
      "gemini-3.1-pro-preview",
    );
    expect(getChatModel("qwen/qwen3.8-27b").reasoning).toBe("high");
    for (const id of [
      "openrouter/auto",
      "qwen/qwen3.7-max",
      "qwen/qwen3.8-max-0902",
      "deepseek/deepseek-v4-pro-0813",
    ]) {
      expect(() => getChatModel(id)).toThrow(/Unsupported/);
    }
    expect(CHAT_MODELS.every((model) => model.images)).toBe(true);
  });

  it.each([false, true])(
    "uses 27B for stored Max assignments when selector visibility is %s",
    async (modelSelectorEnabled) => {
      const f = await chatFixture({
        chatModel: "qwen/qwen3.8-max-0902",
        modelSelectorEnabled,
      });
      expect(await f.owner.query(api.users.getChatSettings, {})).toEqual({
        modelSelectorEnabled,
        model: modelSelectorEnabled ? "qwen/qwen3.8-27b" : null,
      });
      const turn = await f.send("Describe this photo", ["photo.png"]);
      expect(
        (await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)))
          ?.generationTarget,
      ).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-27b" });
      if (modelSelectorEnabled) {
        await f.owner.mutation(api.users.setChatModel, {
          model: "qwen/qwen3.8-27b",
        });
        expect((await f.t.run((ctx) => ctx.db.get(f.userId)))?.chatModel).toBe(
          "qwen/qwen3.8-27b",
        );
        await expect(
          f.owner.mutation(api.users.setChatModel, {
            model: "qwen/qwen3.8-max-0902",
          }),
        ).rejects.toThrow(/Unsupported/);
      }
    },
  );

  it.each([
    {
      model: "qwen/qwen3.8-max-0902",
      provider: "openrouter" as const,
      assignment: "qwen/qwen3.8-27b" as const,
    },
    {
      model: "gemini-3.1-pro-preview",
      provider: "vertex" as const,
      assignment: "gemini-4-argon" as const,
    },
  ])(
    "preserves $model on existing turns, retries and edits after the catalog changes",
    async ({ model, provider, assignment }) => {
      const f = await chatFixture({ chatModel: assignment });
      const turn = await f.send();
      const originalTarget = {
        provider,
        model,
      };
      await f.t.run((ctx) =>
        ctx.db.patch(turn.assistantMessageId, {
          generationTarget: originalTarget,
        }),
      );
      expect(
        await f.t.query(internal.messages.getGenerationTarget, {
          sessionId: turn.sessionId,
          assistantMessageId: turn.assistantMessageId,
          threadId: f.threadId,
          tokenIdentifier: "issuer|owner",
        }),
      ).toEqual(originalTarget);
      await f.finish(turn.assistantMessageId);
      const retry = await f.owner.mutation(api.messages.resend, {
        userMessageId: turn.userMessageId,
      });
      expect(
        (await f.t.run((ctx) => ctx.db.get(retry.assistantMessageId)))
          ?.generationTarget,
      ).toEqual(originalTarget);
      await f.finish(retry.assistantMessageId);
      const edited = await f.owner.mutation(
        api.messages.editLastMessageAndResend,
        {
          messageId: turn.userMessageId,
          content: "Edited question",
        },
      );
      expect(
        (await f.t.run((ctx) => ctx.db.get(edited.assistantMessageId)))
          ?.generationTarget,
      ).toEqual(originalTarget);
    },
  );

  it.each([undefined, false, true])(
    "freezes the saved model when selector visibility is %s",
    async (modelSelectorEnabled) => {
      const f = await chatFixture({
        chatModel: "qwen/qwen3.8-27b",
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
      ).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-27b" });
      await f.finish(turn.assistantMessageId);
      const retry = await f.owner.mutation(api.messages.resend, {
        userMessageId: turn.userMessageId,
      });
      expect(
        (await f.t.run((ctx) => ctx.db.get(retry.assistantMessageId)))
          ?.generationTarget,
      ).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-27b" });
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
    const f = await chatFixture({
      chatModel: "gemini-3.1-pro-preview",
      modelSelectorEnabled: true,
    });
    expect(await f.owner.query(api.users.getChatSettings, {})).toEqual({
      modelSelectorEnabled: true,
      model: "gemini-3.1-pro-preview",
    });
    const previous = await f.send();
    expect(
      (await f.t.run((ctx) => ctx.db.get(previous.assistantMessageId)))
        ?.generationTarget?.model,
    ).toBe("gemini-3.1-pro-preview");
    await f.finish(previous.assistantMessageId);
    await f.owner.mutation(api.users.setChatModel, {
      model: "gemini-4-argon",
    });
    expect(await f.owner.query(api.users.getChatSettings, {})).toEqual({
      modelSelectorEnabled: true,
      model: "gemini-4-argon",
    });
    await expect(
      f.owner.mutation(api.users.setChatModel, { model: "openrouter/auto" }),
    ).rejects.toThrow(/Unsupported/);
    await f.t.mutation(internal.users.setUserChatConfig, {
      userId: f.userId,
      modelSelectorEnabled: false,
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.userId)))?.chatModel).toBe(
      "gemini-4-argon",
    );
    const turn = await f.send("What is in this photo?", ["photo.png"]);
    expect(
      (await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)))
        ?.generationTarget?.model,
    ).toBe("gemini-4-argon");
  });
});
