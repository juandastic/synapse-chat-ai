import { expect, it, vi } from "vitest";
import { api, chatFixture } from "./helpers";
import { PLAN_LIMITS } from "../convex/plans";

async function withUsage(
  plan: "free" | "pro" | "unlimited" | undefined,
  messages: number,
  tokens = 0,
) {
  const f = await chatFixture({ plan });
  await f.t.run((ctx) =>
    ctx.db.insert("monthly_usage", {
      userId: f.userId,
      month: "2026-10",
      totalChatMessages: messages,
      totalChatCharsGenerated: 0,
      totalInputTokens: 0,
      totalOutputTokens: tokens,
      totalIngestions: 0,
      totalCorrections: 0,
      totalIngestedChars: 0,
      dailyStats: { "02": { chatMessages: messages, outputTokens: tokens } },
    }),
  );
  return f;
}

it.each(["free", "pro"] as const)(
  "%s allows the last message below the cap and blocks exactly at the cap",
  async (plan) => {
    const limit = PLAN_LIMITS[plan].dailyMessages;
    const f = await withUsage(plan, limit - 1);
    const turn = await f.send();
    await f.finish(turn.assistantMessageId);
    const usage = await f.t.run((ctx) => ctx.db.query("monthly_usage").first());
    await f.t.run((ctx) =>
      ctx.db.patch(usage!._id, {
        dailyStats: { "02": { chatMessages: limit, outputTokens: 0 } },
      }),
    );
    for (const operation of [
      () => f.send("blocked"),
      () =>
        f.owner.mutation(api.messages.resend, {
          userMessageId: turn.userMessageId,
        }),
      () =>
        f.owner.mutation(api.messages.editLastMessageAndResend, {
          messageId: turn.userMessageId,
          content: "blocked",
        }),
    ])
      await expect(operation()).rejects.toThrow(/daily limit/);
    expect(
      (await f.owner.query(api.messages.list, { threadId: f.threadId })).map(
        (m) => m.content,
      ),
    ).toEqual(["Hello", "Answer"]);
  },
);

it("blocks output token exhaustion even when messages remain", async () => {
  const f = await withUsage("free", 1, PLAN_LIMITS.free.dailyOutputTokens);
  await expect(f.send()).rejects.toThrow(/output token limit/);
  expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toEqual(
    [],
  );
  expect(await f.t.run((ctx) => ctx.db.query("sessions").collect())).toEqual(
    [],
  );
});

it("resets usage at midnight UTC, including month rollover", async () => {
  const f = await withUsage("free", 10, 15000);
  await expect(f.send()).rejects.toThrow(/daily limit/);
  vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
  expect(await f.owner.query(api.usageLimits.getUsageStatus, {})).toMatchObject(
    { dailyMessages: { used: 0 } },
  );
  await f.send("new day");
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  expect(await f.owner.query(api.usageLimits.getUsageStatus, {})).toMatchObject(
    { dailyMessages: { used: 0 } },
  );
});

it("defaults unassigned users to free and leaves unlimited users unblocked", async () => {
  const free = await withUsage(undefined, 10);
  await expect(free.send()).rejects.toThrow(/daily limit/);
  const unlimited = await withUsage("unlimited", 100000, 1000000);
  await unlimited.send();
  expect(
    await unlimited.owner.query(api.usageLimits.getUsageStatus, {}),
  ).toMatchObject({
    plan: "unlimited",
    dailyMessages: { limit: -1 },
    dailyOutputTokens: { limit: -1 },
  });
});
