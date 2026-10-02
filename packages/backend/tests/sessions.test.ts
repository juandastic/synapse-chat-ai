import { expect, it, vi } from "vitest";
import { SESSION_STALE_THRESHOLD_MS as timeout } from "../convex/sessions";
import { api, internal, chatFixture } from "./helpers";

it("keeps a session at the inactivity boundary and rotates it after the boundary", async () => {
  const f = await chatFixture();
  const first = await f.send();
  await f.finish(first.assistantMessageId);
  const start = Date.now();
  vi.setSystemTime(start + timeout);
  const boundary = await f.send("at boundary");
  await f.finish(boundary.assistantMessageId);
  expect(boundary.sessionId).toBe(first.sessionId);
  vi.setSystemTime(start + timeout * 2 + 1);
  const rotated = await f.send("after timeout");
  expect(rotated.sessionId).not.toBe(first.sessionId);
  expect(await f.t.run((ctx) => ctx.db.get(first.sessionId))).toMatchObject({
    status: "closed",
    endedAt: Date.now(),
  });
  const jobs = await f.t.run((ctx) => ctx.db.query("cortex_jobs").collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    type: "ingest",
    sessionId: first.sessionId,
    payload: { messageCount: 4 },
  });
});

it("snapshots persona and user instructions until a new session starts", async () => {
  const f = await chatFixture({ customInstructions: "Be brief" });
  const first = await f.send();
  await f.finish(first.assistantMessageId);
  const original = await f.t.run((ctx) => ctx.db.get(first.sessionId));
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.personaId, { systemPrompt: "New persona" });
    await ctx.db.patch(f.userId, { customInstructions: "Give details" });
  });
  const second = await f.send();
  await f.finish(second.assistantMessageId);
  expect(
    (await f.t.run((ctx) => ctx.db.get(second.sessionId)))?.promptSnapshot,
  ).toEqual(original?.promptSnapshot);
  await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId });
  const next = await f.send();
  expect(
    (await f.t.run((ctx) => ctx.db.get(next.sessionId)))?.promptSnapshot,
  ).not.toEqual(original?.promptSnapshot);
});

it("auto-close reschedules active sessions, closes idle ones and enqueues ingestion once", async () => {
  const f = await chatFixture();
  const first = await f.send();
  await f.finish(first.assistantMessageId);
  const start = Date.now();
  vi.setSystemTime(start + timeout / 2);
  const second = await f.send();
  await f.finish(second.assistantMessageId);
  vi.setSystemTime(start + timeout);
  await f.t.mutation(internal.sessions.autoClose, {
    sessionId: first.sessionId,
  });
  const active = await f.t.run((ctx) => ctx.db.get(first.sessionId));
  expect(active?.status).toBe("active");
  const scheduled = await f.t.run((ctx) =>
    ctx.db.system.get(active!.closerJobId!),
  );
  expect(scheduled?.scheduledTime).toBe(start + timeout * 1.5);
  expect(await f.t.run((ctx) => ctx.db.query("cortex_jobs").collect())).toEqual(
    [],
  );
  vi.setSystemTime(start + timeout * 1.5);
  await f.t.mutation(internal.sessions.autoClose, {
    sessionId: first.sessionId,
  });
  await f.t.mutation(internal.sessions.autoClose, {
    sessionId: first.sessionId,
  });
  expect(await f.t.run((ctx) => ctx.db.get(first.sessionId))).toMatchObject({
    status: "closed",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("cortex_jobs").collect()),
  ).toHaveLength(1);
});

it("manual consolidation waits for streaming and repeated clicks do not duplicate ingestion", async () => {
  const f = await chatFixture();
  const turn = await f.send();
  expect(
    await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId }),
  ).toMatchObject({ success: false });
  expect((await f.t.run((ctx) => ctx.db.get(turn.sessionId)))?.status).toBe(
    "active",
  );
  expect(await f.t.run((ctx) => ctx.db.query("cortex_jobs").collect())).toEqual(
    [],
  );
  await f.finish(turn.assistantMessageId);
  expect(
    await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId }),
  ).toMatchObject({ success: true, ingestEnqueued: true });
  expect(
    await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId }),
  ).toMatchObject({ success: false });
  expect(
    await f.t.run((ctx) => ctx.db.query("cortex_jobs").collect()),
  ).toHaveLength(1);
});

it("ingest completion does not replace a session the user already started", async () => {
  const f = await chatFixture();
  const first = await f.send();
  await f.finish(first.assistantMessageId);
  await f.owner.mutation(api.sessions.forceClose, { threadId: f.threadId });
  const next = await f.send();
  const draft = await f.t.mutation(internal.sessions.createDraftSession, {
    userId: f.userId,
    threadId: f.threadId,
  });
  expect(draft).toBe(next.sessionId);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_thread_status", (q) =>
          q.eq("threadId", f.threadId).eq("status", "active"),
        )
        .collect(),
    ),
  ).toHaveLength(1);
});

it("closed is a terminal status and processing can return to active", async () => {
  const f = await chatFixture();
  const turn = await f.send();
  await f.t.mutation(internal.sessions.updateStatus, {
    sessionId: turn.sessionId,
    status: "processing",
  });
  await f.t.mutation(internal.sessions.updateStatus, {
    sessionId: turn.sessionId,
    status: "active",
  });
  await f.t.mutation(internal.sessions.updateStatus, {
    sessionId: turn.sessionId,
    status: "closed",
  });
  await expect(
    f.t.mutation(internal.sessions.updateStatus, {
      sessionId: turn.sessionId,
      status: "active",
    }),
  ).rejects.toThrow(/Invalid session status transition/);
  expect((await f.t.run((ctx) => ctx.db.get(turn.sessionId)))?.status).toBe(
    "closed",
  );
});
