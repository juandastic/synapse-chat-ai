import { beforeEach, expect, it, vi } from "vitest";
import { chatFixture, internal } from "./helpers";
import { MAX_AUDIO_BYTES } from "../audio";

const options = () => ({
  method: "POST",
  headers: { "Content-Type": "audio/webm;codecs=opus" },
  body: new Uint8Array([1, 2, 3]),
});
beforeEach(() => {
  vi.stubEnv("SYNAPSE_CORTEX_API_SECRET", "private-service-secret");
});

it("requires a registered authenticated user before invoking Cortex", async () => {
  const f = await chatFixture();
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  expect((await f.t.fetch("/audio/transcribe", options())).status).toBe(401);
  expect((await f.stranger.fetch("/audio/transcribe", options())).status).toBe(
    401,
  );
  expect(provider).not.toHaveBeenCalled();
});

it("proxies raw audio with service auth and returns only text without creating messages", async () => {
  const f = await chatFixture();
  const provider = vi.fn(async () =>
    Response.json({
      text: "  Vivo en Bogotá.  ",
      ignored: "private-service-secret",
    }),
  );
  vi.stubGlobal("fetch", provider);
  const response = await f.owner.fetch("/audio/transcribe", options());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "Vivo en Bogotá." });
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining("/v1/audio/transcriptions"),
    expect.objectContaining({
      headers: {
        "Content-Type": "audio/webm",
        "X-API-SECRET": "private-service-secret",
      },
      body: new Uint8Array([1, 2, 3]),
    }),
  );
  expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toEqual(
    [],
  );
  expect(
    await f.t.run((ctx) => ctx.db.query("audio_transcription_limits").first()),
  ).toMatchObject({ userId: f.userId, attempts: 1, activeUntil: 0 });
});

it("checks upload type and actual size before reserving quota or contacting Cortex", async () => {
  const f = await chatFixture();
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  expect(
    (
      await f.owner.fetch("/audio/transcribe", {
        ...options(),
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
  ).toBe(415);
  expect(
    (
      await f.owner.fetch("/audio/transcribe", {
        ...options(),
        body: new Uint8Array(MAX_AUDIO_BYTES + 1),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await f.owner.fetch("/audio/transcribe", {
        ...options(),
        body: new Uint8Array(),
      })
    ).status,
  ).toBe(400);
  expect(provider).not.toHaveBeenCalled();
  expect(
    await f.t.run((ctx) => ctx.db.query("audio_transcription_limits").first()),
  ).toBeNull();
});

it("releases an in-flight allowance after a provider error so the user can retry", async () => {
  const f = await chatFixture();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response("private-service-secret", { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json({ text: "Recovered" })),
  );
  const first = await f.owner.fetch("/audio/transcribe", options());
  expect(first.status).toBe(503);
  expect(await first.text()).not.toContain("private-service-secret");
  expect((await f.owner.fetch("/audio/transcribe", options())).status).toBe(
    200,
  );
});

it("blocks concurrent work and stale completion cannot unlock a newer request", async () => {
  const f = await chatFixture();
  const reserve = (requestId: string) =>
    f.t.mutation(internal.audioTranscription.reserve, {
      tokenIdentifier: "issuer|owner",
      requestId,
    });
  expect((await reserve("first")).allowed).toBe(true);
  expect((await reserve("second")).status).toBe(429);
  vi.setSystemTime(Date.now() + 121_000);
  expect((await reserve("second")).allowed).toBe(true);
  await f.t.mutation(internal.audioTranscription.release, {
    tokenIdentifier: "issuer|owner",
    requestId: "first",
  });
  expect((await reserve("third")).status).toBe(429);
});

it("counts failed attempts, caps the day, and renews quota at midnight UTC", async () => {
  const f = await chatFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("failure", { status: 502 })),
  );
  for (let i = 0; i < 30; i++)
    expect((await f.owner.fetch("/audio/transcribe", options())).status).toBe(
      502,
    );
  expect((await f.owner.fetch("/audio/transcribe", options())).status).toBe(
    429,
  );
  vi.setSystemTime(Date.now() + 86_400_000);
  expect((await f.owner.fetch("/audio/transcribe", options())).status).toBe(
    502,
  );
});

it("allows CORS preflight and fails closed without the Cortex service credential", async () => {
  const f = await chatFixture();
  expect(
    (
      await f.t.fetch("/audio/transcribe", {
        method: "OPTIONS",
        headers: { Origin: "https://synapse.example" },
      })
    ).status,
  ).toBe(204);
  vi.stubEnv("SYNAPSE_CORTEX_API_SECRET", "");
  expect((await f.owner.fetch("/audio/transcribe", options())).status).toBe(
    503,
  );
});
