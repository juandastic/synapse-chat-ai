import { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ChatContext } from "./useChatContext";

interface ChatProviderProps {
  threadId: Id<"threads">;
  children: ReactNode;
}

export function ChatProvider({ threadId, children }: ChatProviderProps) {
  const messages = useQuery(api.messages.list, { threadId, limit: 30 });

  const [streamedMessageId, setStreamedMessageId] =
    useState<Id<"messages"> | null>(null);
  const [streamedContent, setStreamedContent] = useState("");

  const isLoading = messages === undefined;

  // Clear local streaming state once the DB message is finalized
  useEffect(() => {
    if (!streamedMessageId || !messages) return;
    const msg = messages.find((m) => m._id === streamedMessageId);
    if (msg && msg.completedAt !== undefined) {
      setStreamedMessageId(null);
      setStreamedContent("");
    }
  }, [messages, streamedMessageId]);

  // Overlay locally streamed content on the DB messages.
  // Once the message has completedAt, the DB content is authoritative.
  const displayMessages = useMemo(() => {
    if (!messages || !streamedMessageId) return messages;
    return messages.map((m) => {
      if (m._id !== streamedMessageId) return m;
      if (m.completedAt !== undefined) return m;
      return { ...m, content: streamedContent };
    });
  }, [messages, streamedMessageId, streamedContent]);

  const isGenerating = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    return (
      lastMessage.role === "assistant" && lastMessage.completedAt === undefined
    );
  }, [messages]);

  const startStreaming = useCallback((messageId: Id<"messages">) => {
    setStreamedMessageId(messageId);
    setStreamedContent("");
  }, []);

  const updateStreamedContent = useCallback((content: string) => {
    setStreamedContent(content);
  }, []);

  const stopStreaming = useCallback(() => {
    setStreamedMessageId(null);
    setStreamedContent("");
  }, []);

  const contextValue = useMemo(
    () => ({
      messages: displayMessages,
      isGenerating,
      isLoading,
      threadId,
      startStreaming,
      updateStreamedContent,
      stopStreaming,
    }),
    [
      displayMessages,
      isGenerating,
      isLoading,
      threadId,
      startStreaming,
      updateStreamedContent,
      stopStreaming,
    ]
  );

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}
