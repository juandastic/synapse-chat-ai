import { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@synapse/backend/api";
import { Doc, Id } from "@synapse/backend/dataModel";
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
  const [editingMessage, setEditingMessage] =
    useState<Doc<"messages"> | null>(null);

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
  const displayMessages = useMemo(() => {
    if (!messages || !streamedMessageId) return messages;
    return messages.map((m) => {
      if (m._id !== streamedMessageId) return m;
      if (m.completedAt !== undefined) return m;
      return { ...m, content: streamedContent };
    });
  }, [messages, streamedMessageId, streamedContent]);

  const lastMessage = messages?.[messages.length - 1];
  const isGenerating =
    lastMessage?.role === "assistant" && lastMessage.completedAt === undefined;

  const startStreaming = useCallback((messageId: Id<"messages">) => {
    setStreamedMessageId(messageId);
    setStreamedContent("");
  }, []);

  const stopStreaming = useCallback(() => {
    setStreamedMessageId(null);
    setStreamedContent("");
  }, []);

  const beginEditing = useCallback((message: Doc<"messages">) => {
    if (message.role !== "user") return;
    setEditingMessage(message);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMessage(null);
  }, []);

  useEffect(() => {
    setEditingMessage(null);
  }, [threadId]);

  const contextValue = useMemo(
    () => ({
      messages: displayMessages,
      isGenerating,
      isLoading,
      threadId,
      editingMessage,
      beginEditing,
      cancelEditing,
      startStreaming,
      updateStreamedContent: setStreamedContent,
      stopStreaming,
    }),
    [
      displayMessages,
      isGenerating,
      isLoading,
      threadId,
      editingMessage,
      beginEditing,
      cancelEditing,
      startStreaming,
      setStreamedContent,
      stopStreaming,
    ]
  );

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}
