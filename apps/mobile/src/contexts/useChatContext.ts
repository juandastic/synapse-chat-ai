import { createContext, useContext } from "react";
import type { Doc, Id } from "@synapse/backend/dataModel";

interface ChatContextValue {
  messages: Doc<"messages">[] | undefined;
  isGenerating: boolean;
  isLoading: boolean;
  threadId: Id<"threads">;
  editingMessage: Doc<"messages"> | null;
  beginEditing: (message: Doc<"messages">) => void;
  cancelEditing: () => void;
  startStreaming: (messageId: Id<"messages">) => void;
  updateStreamedContent: (content: string) => void;
  stopStreaming: () => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
}
