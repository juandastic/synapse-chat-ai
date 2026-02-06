import { createContext, useContext } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export interface ChatContextValue {
  messages: Doc<"messages">[] | undefined;
  isGenerating: boolean;
  isLoading: boolean;
  threadId: Id<"threads">;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
}
