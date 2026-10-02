import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Id } from "@synapse/backend/dataModel";
import { useStreamResponse } from "./useStreamResponse";

const f = vi.hoisted(() => ({
  token: vi.fn(),
  report: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => f.report }));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: f.token }),
}));
vi.mock("sonner", () => ({ toast: { error: f.toast } }));
vi.mock("@/contexts/useChatContext", () => ({
  useChatContext: () => ({
    threadId: "thread",
    updateStreamedContent: f.update,
    stopStreaming: f.stop,
  }),
}));
beforeEach(() => {
  f.token.mockResolvedValue("jwt");
  f.report.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
const run = async () => {
  const { result } = renderHook(() => useStreamResponse());
  await act(() =>
    result.current("assistant" as Id<"messages">, "session" as Id<"sessions">),
  );
};

it("streams cumulative text across UTF-8 boundaries and sends authenticated IDs", async () => {
  const bytes = new TextEncoder().encode("Hola 👋");
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 7));
          controller.enqueue(bytes.slice(7));
          controller.close();
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await run();
  expect(fetch).toHaveBeenCalledWith(
    "https://test.convex.site/chat",
    expect.objectContaining({
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer jwt",
      },
      body: JSON.stringify({
        sessionId: "session",
        threadId: "thread",
        assistantMessageId: "assistant",
      }),
    }),
  );
  expect(f.update.mock.calls.map(([text]) => text)).toEqual([
    "Hola ",
    "Hola 👋",
  ]);
  expect(f.report).not.toHaveBeenCalled();
  expect(f.stop).not.toHaveBeenCalled();
});

it("releases the reader on success and failure", async () => {
  for (const fail of [false, true]) {
    const releaseLock = vi.fn();
    const read = fail
      ? vi.fn().mockRejectedValue(new Error("Read failed"))
      : vi.fn().mockResolvedValue({ done: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => ({ read, releaseLock }) },
      }),
    );
    await run();
    expect(releaseLock).toHaveBeenCalledTimes(1);
  }
});

it("shows the backend quota error and reports a terminal HTTP failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Daily quota reached" }), {
        status: 429,
      }),
    ),
  );
  await run();
  expect(f.toast).toHaveBeenCalledWith("Daily quota reached");
  expect(f.stop).toHaveBeenCalledTimes(1);
  expect(f.report).toHaveBeenCalledWith({
    messageId: "assistant",
    errorMessage: expect.any(String),
  });
});

it.each(["Failed to fetch", "Load failed"])(
  "does not overwrite a server generation after browser disconnect: %s",
  async (message) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
    await run();
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.report).not.toHaveBeenCalled();
    expect(f.toast).not.toHaveBeenCalled();
  },
);

it("handles an empty body and a rejected failure report without an unhandled rejection", async () => {
  f.report.mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: null }));
  await run();
  expect(f.toast).toHaveBeenCalledWith("Response body is empty");
  expect(f.stop).toHaveBeenCalledTimes(1);
});
