import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

interface ChatContextValue {
  messages: Doc<"messages">[] | undefined;
  isGenerating: boolean;
  isLoading: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const messages = useQuery(api.messages.list, { limit: 100 });

  const isLoading = messages === undefined;

  // Derive isGenerating from the last message
  const isGenerating = (() => {
    if (!messages || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    return (
      lastMessage.role === "assistant" && lastMessage.completedAt === undefined
    );
  })();

  return (
    <ChatContext.Provider value={{ messages, isGenerating, isLoading }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
}
