import { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";

interface ChatContextValue {
  messages: Doc<"messages">[] | undefined;
  isGenerating: boolean;
  isLoading: boolean;
  threadId: Id<"threads">;
}

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  threadId: Id<"threads">;
  children: ReactNode;
}

export function ChatProvider({ threadId, children }: ChatProviderProps) {
  const messages = useQuery(api.messages.list, { threadId, limit: 100 });

  const isLoading = messages === undefined;

  // Derive isGenerating from the last message (memoized to avoid recalculation)
  const isGenerating = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    return (
      lastMessage.role === "assistant" && lastMessage.completedAt === undefined
    );
  }, [messages]);

  const contextValue = useMemo(
    () => ({ messages, isGenerating, isLoading, threadId }),
    [messages, isGenerating, isLoading, threadId]
  );

  return (
    <ChatContext.Provider value={contextValue}>
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
