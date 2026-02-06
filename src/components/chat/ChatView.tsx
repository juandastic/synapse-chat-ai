import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ChatProvider } from "@/contexts/ChatContext";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

/**
 * Thread chat view rendered at /t/:threadId.
 * Fetches thread data for the header and provides threadId to children.
 */
export function ChatView() {
  const { threadId } = useParams<{ threadId: string }>();

  // Validate threadId param
  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Thread not found</p>
      </div>
    );
  }

  const typedThreadId = threadId as Id<"threads">;

  return <ChatViewInner threadId={typedThreadId} />;
}

function ChatViewInner({ threadId }: { threadId: Id<"threads"> }) {
  const thread = useQuery(api.threads.get, { threadId });

  // Loading state
  if (thread === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading thread...</span>
        </div>
      </div>
    );
  }

  // Thread not found or unauthorized
  if (thread === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Thread not found or access denied</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
        <div className="flex items-center gap-3">
          <span className="text-xl" role="img" aria-hidden="true">
            {thread.persona.icon}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
              {thread.title}
            </h1>
            {thread.persona.description && (
              <p className="truncate text-xs text-muted-foreground">
                {thread.persona.description}
              </p>
            )}
          </div>
        </div>
      </header>

      <ChatProvider threadId={threadId}>
        {/* Messages area */}
        <div className="relative flex-1 overflow-hidden">
          <MessageList
            personaIcon={thread.persona.icon}
            personaName={thread.persona.name}
          />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-sm">
          <ChatInput />
        </div>
      </ChatProvider>
    </div>
  );
}
