import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Doc, Id } from "@synapse/backend/dataModel";
import { ChatProvider } from "./ChatContext";
import { useChatContext } from "./useChatContext";
const f = vi.hoisted(() => ({
  messages: undefined as Doc<"messages">[] | undefined,
}));
vi.mock("convex/react", () => ({ useQuery: () => f.messages }));
const threadId = "thread" as Id<"threads">;
const message = (
  id: string,
  role: "user" | "assistant",
  content: string,
): Doc<"messages"> => ({
  _id: id as Id<"messages">,
  _creationTime: 1,
  threadId,
  sessionId: "session" as Id<"sessions">,
  role,
  content,
  type: "text",
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatProvider threadId={threadId}>{children}</ChatProvider>
);
beforeEach(() => {
  f.messages = undefined;
});

it("distinguishes loading, empty history and a generating assistant", () => {
  const { result, rerender } = renderHook(useChatContext, { wrapper });
  expect(result.current.isLoading).toBe(true);
  f.messages = [];
  rerender();
  expect(result.current.isLoading).toBe(false);
  expect(result.current.isGenerating).toBe(false);
  f.messages = [
    message("user", "user", "Hi"),
    message("assistant", "assistant", ""),
  ];
  rerender();
  expect(result.current.isGenerating).toBe(true);
});

it("overlays only the streaming reply and lets persisted content win on completion", () => {
  const assistant = message("assistant", "assistant", "");
  f.messages = [message("user", "user", "Hi"), assistant];
  const { result, rerender } = renderHook(useChatContext, { wrapper });
  act(() => result.current.startStreaming(assistant._id));
  act(() => result.current.updateStreamedContent("partial"));
  expect(result.current.messages?.map((m) => m.content)).toEqual([
    "Hi",
    "partial",
  ]);
  f.messages = [
    f.messages[0],
    { ...assistant, content: "server answer", completedAt: 2 },
  ];
  rerender();
  expect(result.current.messages?.[1].content).toBe("server answer");
  expect(result.current.isGenerating).toBe(false);
  act(() => result.current.updateStreamedContent("late chunk"));
  expect(result.current.messages?.[1].content).toBe("server answer");
});

it("stopStreaming discards partial display without editing persisted history", () => {
  const assistant = message("assistant", "assistant", "persisted");
  f.messages = [assistant];
  const { result } = renderHook(useChatContext, { wrapper });
  act(() => result.current.startStreaming(assistant._id));
  act(() => result.current.updateStreamedContent("partial"));
  act(() => result.current.stopStreaming());
  expect(result.current.messages?.[0].content).toBe("persisted");
});
