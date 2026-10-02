import { describe, expect, it } from "vitest";
import { api, internal, chatFixture } from "./helpers";

describe("message lifecycle", () => {
  it("creates a trimmed user turn and assistant placeholder, and reuses its active session", async () => {
    const f = await chatFixture();
    const first = await f.send("  My name is Ana  ");
    await f.finish(first.assistantMessageId);
    const second = await f.send("Remember it");
    expect(second.sessionId).toBe(first.sessionId);
    const messages = await f.owner.query(api.messages.list, {
      threadId: f.threadId,
    });
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "My name is Ana"],
      ["assistant", "Answer"],
      ["user", "Remember it"],
      ["assistant", ""],
    ]);
    expect(messages[3].completedAt).toBeUndefined();
    expect(
      await f.t.run((ctx) => ctx.db.query("sessions").collect()),
    ).toHaveLength(1);
  });

  it.each(["   ", "x".repeat(10001)])(
    "rejects invalid content without creating messages or sessions",
    async (content) => {
      const f = await chatFixture();
      await expect(f.send(content)).rejects.toThrow(
        /content or images|maximum length/,
      );
      expect(
        await f.t.run((ctx) => ctx.db.query("messages").collect()),
      ).toEqual([]);
      expect(
        await f.t.run((ctx) => ctx.db.query("sessions").collect()),
      ).toEqual([]);
    },
  );

  it("allows an image-only turn and detects images beyond the visible message page", async () => {
    const f = await chatFixture();
    const first = await f.send("", ["photo.png"]);
    await f.finish(first.assistantMessageId);
    await f.send("Another turn");
    const visible = await f.owner.query(api.messages.list, {
      threadId: f.threadId,
      limit: 2,
    });
    expect(visible.every((m) => !m.imageKeys)).toBe(true);
    expect(
      await f.owner.query(api.messages.getModelCapabilities, {
        threadId: f.threadId,
      }),
    ).toEqual({ hasImages: true });
  });

  it("queries isolate threads and return the newest page in chronological order", async () => {
    const f = await chatFixture();
    const a = await f.send("first");
    await f.finish(a.assistantMessageId);
    const b = await f.send("second");
    await f.finish(b.assistantMessageId, "second answer");
    const otherThread = await f.owner.mutation(api.threads.create, {
      personaId: f.personaId,
    });
    await f.owner.mutation(api.messages.send, {
      threadId: otherThread,
      content: "other thread",
    });
    expect(
      (
        await f.owner.query(api.messages.list, {
          threadId: f.threadId,
          limit: 2,
        })
      ).map((m) => m.content),
    ).toEqual(["second", "second answer"]);
    expect(
      (
        await f.t.query(internal.messages.getBySession, {
          sessionId: a.sessionId,
        })
      ).map((m) => m.content),
    ).toEqual(["first", "Answer", "second", "second answer"]);
  });

  it("redacts provider, cost and errors from public messages while retaining recall and citations", async () => {
    const f = await chatFixture({ chatModel: "qwen/qwen3.8-max-0902" });
    const turn = await f.send();
    await f.t.mutation(internal.messages.finalizeGeneration, {
      id: turn.assistantMessageId,
      content: "answer",
      completedAt: Date.now(),
      metadata: {
        model: "qwen/qwen3.8-max-0902",
        provider: "openrouter",
        cost: 0.1,
        ragEnabled: true,
        ragNodes: 2,
        groundingUsed: true,
        groundingSources: [{ title: "Source", uri: "https://example.com" }],
      },
    });
    const visible = (
      await f.owner.query(api.messages.list, { threadId: f.threadId })
    )[1];
    expect(visible).not.toHaveProperty("generationTarget");
    const metadata = "metadata" in visible ? visible.metadata : undefined;
    expect(metadata).not.toHaveProperty("model");
    expect(metadata).not.toHaveProperty("provider");
    expect(metadata).not.toHaveProperty("cost");
    expect(metadata).toMatchObject({
      ragNodes: 2,
      groundingSources: [{ title: "Source" }],
    });
    const stored = await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId));
    expect(stored?.generationTarget?.model).toBe("qwen/qwen3.8-max-0902");
    expect(stored?.metadata?.cost).toBe(0.1);
  });

  it("edits only the latest completed text turn in place and clears old response metadata", async () => {
    const f = await chatFixture();
    const turn = await f.send();
    await expect(
      f.owner.mutation(api.messages.editLastMessageAndResend, {
        messageId: turn.userMessageId,
        content: "edited",
      }),
    ).rejects.toThrow(/still generating/);
    await f.finish(turn.assistantMessageId);
    const edited = await f.owner.mutation(
      api.messages.editLastMessageAndResend,
      { messageId: turn.userMessageId, content: " edited " },
    );
    expect(edited).toEqual(turn);
    expect(
      await f.t.run((ctx) => ctx.db.get(turn.userMessageId)),
    ).toMatchObject({ content: "edited" });
    const reply = await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId));
    expect(reply).toMatchObject({ content: "", type: "text" });
    expect(reply?.completedAt).toBeUndefined();
    expect(reply?.metadata).toBeUndefined();
    expect(
      await f.t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(2);
  });

  it("rejects edits to old turns, image messages and closed sessions without changing history", async () => {
    const f = await chatFixture();
    const first = await f.send();
    await f.finish(first.assistantMessageId);
    const image = await f.send("photo", ["photo.png"]);
    await f.finish(image.assistantMessageId);
    await expect(
      f.owner.mutation(api.messages.editLastMessageAndResend, {
        messageId: first.userMessageId,
        content: "changed",
      }),
    ).rejects.toThrow(/latest/);
    await expect(
      f.owner.mutation(api.messages.editLastMessageAndResend, {
        messageId: image.userMessageId,
        content: "changed",
      }),
    ).rejects.toThrow(/images/);
    const last = await f.send("last");
    await f.finish(last.assistantMessageId);
    await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId });
    await expect(
      f.owner.mutation(api.messages.editLastMessageAndResend, {
        messageId: last.userMessageId,
        content: "changed",
      }),
    ).rejects.toThrow(/closed/);
    expect(
      (await f.owner.query(api.messages.list, { threadId: f.threadId })).map(
        (m) => m.content,
      ),
    ).toEqual(["Hello", "Answer", "photo", "Answer", "last", "Answer"]);
  });

  it("retry cannot replace a response that is still streaming", async () => {
    const f = await chatFixture();
    const turn = await f.send();
    await expect(
      f.owner.mutation(api.messages.resend, {
        userMessageId: turn.userMessageId,
      }),
    ).rejects.toThrow(/still generating/);
    expect(
      await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)),
    ).not.toBeNull();
    expect(
      await f.t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(2);
  });

  it("a client failure cannot overwrite a server answer and a late server answer repairs a client failure", async () => {
    const f = await chatFixture();
    const turn = await f.send();
    await f.owner.mutation(api.messages.reportStreamFailure, {
      messageId: turn.assistantMessageId,
    });
    expect(
      await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)),
    ).toMatchObject({ type: "error" });
    await f.finish(turn.assistantMessageId, "server answer");
    await f.owner.mutation(api.messages.reportStreamFailure, {
      messageId: turn.assistantMessageId,
    });
    expect(
      await f.t.run((ctx) => ctx.db.get(turn.assistantMessageId)),
    ).toMatchObject({ type: "text", content: "server answer" });
  });

  it.each(["user", "assistant"] as const)(
    "deleting the %s half removes only its pair",
    async (half) => {
      const f = await chatFixture();
      const first = await f.send();
      await f.finish(first.assistantMessageId);
      const second = await f.send("keep me");
      await f.owner.mutation(api.messages.deleteMessage, {
        messageId:
          half === "user" ? first.userMessageId : first.assistantMessageId,
      });
      expect(
        (await f.owner.query(api.messages.list, { threadId: f.threadId })).map(
          (m) => m._id,
        ),
      ).toEqual([second.userMessageId, second.assistantMessageId]);
      // Finalization can race deletion; it must not recreate the deleted answer.
      await f.finish(first.assistantMessageId);
      expect(
        await f.t.run((ctx) => ctx.db.get(first.assistantMessageId)),
      ).toBeNull();
    },
  );
});

describe("ownership boundaries", () => {
  it("anonymous reads expose nothing and writes require authentication", async () => {
    const f = await chatFixture();
    expect(
      await f.t.query(api.messages.list, { threadId: f.threadId }),
    ).toEqual([]);
    await expect(
      f.t.mutation(api.messages.send, {
        threadId: f.threadId,
        content: "intruder",
      }),
    ).rejects.toThrow(/Authentication/);
  });

  it("another user cannot read, send, edit, retry, delete, consolidate or start a generation", async () => {
    const f = await chatFixture();
    const turn = await f.send();
    expect(
      await f.stranger.query(api.messages.list, { threadId: f.threadId }),
    ).toEqual([]);
    expect(
      await f.stranger.query(api.threads.get, { threadId: f.threadId }),
    ).toBeNull();
    for (const operation of [
      () =>
        f.stranger.mutation(api.messages.send, {
          threadId: f.threadId,
          content: "intruder",
        }),
      () =>
        f.stranger.mutation(api.messages.editLastMessageAndResend, {
          messageId: turn.userMessageId,
          content: "intruder",
        }),
      () =>
        f.stranger.mutation(api.messages.resend, {
          userMessageId: turn.userMessageId,
        }),
      () =>
        f.stranger.mutation(api.messages.deleteMessage, {
          messageId: turn.userMessageId,
        }),
      () =>
        f.stranger.mutation(api.messages.reportStreamFailure, {
          messageId: turn.assistantMessageId,
        }),
      () =>
        f.stranger.mutation(api.sessions.forceClose, { threadId: f.threadId }),
      () => f.stranger.mutation(api.threads.create, { personaId: f.personaId }),
      () =>
        f.t.query(internal.messages.getGenerationTarget, {
          sessionId: turn.sessionId,
          assistantMessageId: turn.assistantMessageId,
          threadId: f.threadId,
          tokenIdentifier: "issuer|stranger",
        }),
    ])
      await expect(operation()).rejects.toThrow();
    expect(
      (await f.owner.query(api.messages.list, { threadId: f.threadId })).map(
        (m) => m.content,
      ),
    ).toEqual(["Hello", ""]);
  });

  it("generation rejects a mixed session, a user message and a completed placeholder", async () => {
    const f = await chatFixture();
    const first = await f.send();
    const otherThread = await f.owner.mutation(api.threads.create, {
      personaId: f.personaId,
    });
    const other = await f.owner.mutation(api.messages.send, {
      threadId: otherThread,
      content: "Other",
    });
    const args = {
      sessionId: first.sessionId,
      assistantMessageId: first.assistantMessageId,
      threadId: f.threadId,
      tokenIdentifier: "issuer|owner",
    };
    await expect(
      f.t.query(internal.messages.getGenerationTarget, {
        ...args,
        sessionId: other.sessionId,
      }),
    ).rejects.toThrow(/Invalid/);
    await expect(
      f.t.query(internal.messages.getGenerationTarget, {
        ...args,
        assistantMessageId: first.userMessageId,
      }),
    ).rejects.toThrow(/Invalid/);
    await f.finish(first.assistantMessageId);
    await expect(
      f.t.query(internal.messages.getGenerationTarget, args),
    ).rejects.toThrow(/Invalid/);
  });
});
