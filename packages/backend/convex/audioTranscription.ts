import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { CORTEX_API_BASE_URL } from "./cortexConfig";
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES } from "../audio";

const DAILY_ATTEMPTS = 30;
const LEASE_MS = 120_000;

/** Atomic per-user allowance; failed provider attempts also consume the daily cap. */
export const reserve = internalMutation({
  args: { tokenIdentifier: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();
    if (!user) return { allowed: false, status: 401 };
    const existing = await ctx.db
      .query("audio_transcription_limits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const attempts = existing?.day === day ? existing.attempts : 0;
    if (attempts >= DAILY_ATTEMPTS || (existing?.activeUntil ?? 0) > now) {
      return { allowed: false, status: 429 };
    }
    const values = {
      day,
      attempts: attempts + 1,
      requestId: args.requestId,
      activeUntil: now + LEASE_MS,
    };
    if (existing) await ctx.db.patch(existing._id, values);
    else
      await ctx.db.insert("audio_transcription_limits", {
        userId: user._id,
        ...values,
      });
    return { allowed: true, status: 200 };
  },
});

export const release = internalMutation({
  args: { tokenIdentifier: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();
    if (!user) return;
    const row = await ctx.db
      .query("audio_transcription_limits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (row?.requestId === args.requestId)
      await ctx.db.patch(row._id, { activeUntil: 0 });
  },
});

export const transcribe = httpAction(async (ctx, request) => {
  const headers = {
    "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const fail = (status: number) =>
    Response.json({ error: "Transcription failed" }, { status, headers });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return fail(401);
  const secret = process.env.SYNAPSE_CORTEX_API_SECRET;
  if (!secret) return fail(503);
  const mime = (request.headers.get("Content-Type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mime)) return fail(415);
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_AUDIO_BYTES)
  )
    return fail(413);
  if (!request.body) return fail(400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_AUDIO_BYTES) {
        await reader.cancel();
        return fail(413);
      }
      chunks.push(next.value);
    }
  } catch {
    return fail(400);
  } finally {
    reader.releaseLock();
  }
  if (!size) return fail(400);
  const lease = {
    tokenIdentifier: identity.tokenIdentifier,
    requestId: crypto.randomUUID(),
  };
  const reservation = await ctx.runMutation(
    internal.audioTranscription.reserve,
    lease,
  );
  if (!reservation.allowed) return fail(reservation.status);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const upstream = await fetch(
      `${CORTEX_API_BASE_URL}/v1/audio/transcriptions`,
      {
        method: "POST",
        headers: { "Content-Type": mime, "X-API-SECRET": secret },
        body,
        signal: AbortSignal.timeout(100_000),
      },
    );
    if (!upstream.ok)
      return fail(
        [400, 413, 415, 422, 503, 504].includes(upstream.status)
          ? upstream.status
          : 502,
      );
    const payload: unknown = await upstream.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("text" in payload) ||
      typeof payload.text !== "string" ||
      !payload.text.trim() ||
      payload.text.length > 100_000
    )
      return fail(422);
    return Response.json({ text: payload.text.trim() }, { headers });
  } catch {
    return fail(502);
  } finally {
    await ctx.runMutation(internal.audioTranscription.release, lease);
  }
});
