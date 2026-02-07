import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ChatProvider } from "@/contexts/ChatContext";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const forceClose = useMutation(api.sessions.forceClose);
  const [consolidating, setConsolidating] = useState(false);

  const handleConsolidate = useCallback(async () => {
    if (consolidating) return;
    setConsolidating(true);
    try {
      const result = await forceClose({ threadId });
      if (result.success) {
        toast.success("Memory consolidation started...");
      } else {
        toast.info(result.message);
      }
    } catch {
      toast.error("Failed to start consolidation");
    } finally {
      setConsolidating(false);
    }
  }, [forceClose, threadId, consolidating]);

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
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-xl" role="img" aria-hidden="true">
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

        {/* Consolidate Memory button */}
        <button
          onClick={handleConsolidate}
          disabled={consolidating}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          title="Consolidate Memory"
        >
          {consolidating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Brain className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Consolidate</span>
        </button>
      </header>

      <ChatProvider threadId={threadId}>
        {/* Messages area */}
        <div className="flex-1 overflow-hidden">
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
