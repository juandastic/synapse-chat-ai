import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { ChatProvider } from "@/contexts/ChatContext";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PersonaIcon } from "@/components/ui/PersonaIcon";

/**
 * Thread chat view rendered at /t/:threadId.
 * Fetches thread data for the header and provides threadId to children.
 */
export function ChatView() {
  const { threadId } = useParams<{ threadId: string }>();
  const { t } = useTranslation("chat");

  // Validate threadId param
  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t("chatView.threadNotFound")}</p>
      </div>
    );
  }

  const typedThreadId = threadId as Id<"threads">;

  return <ChatViewInner threadId={typedThreadId} />;
}

function ChatViewInner({ threadId }: { threadId: Id<"threads"> }) {
  const thread = useQuery(api.threads.get, { threadId });
  const forceClose = useMutation(api.sessions.forceClose);
  const updateTitle = useMutation(api.threads.updateTitle);
  const { t } = useTranslation("chat");
  const [consolidating, setConsolidating] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleConsolidate = useCallback(async () => {
    if (consolidating) return;
    setConsolidating(true);
    try {
      const result = await forceClose({ threadId });
      if (result.success) {
        toast.success(t("chatView.consolidationStarted"));
      } else {
        toast.info(result.message);
      }
    } catch {
      toast.error(t("chatView.consolidationFailed"));
    } finally {
      setConsolidating(false);
    }
  }, [forceClose, threadId, consolidating]);

  const handleTitleClick = useCallback(() => {
    if (thread) {
      setEditTitle(thread.title);
      setIsEditingTitle(true);
    }
  }, [thread]);

  const handleTitleSave = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== thread?.title) {
      try {
        await updateTitle({ threadId, title: trimmed });
      } catch {
        toast.error(t("chatView.updateTitleFailed"));
      }
    }
    setIsEditingTitle(false);
  }, [editTitle, thread?.title, updateTitle, threadId]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSave();
      } else if (e.key === "Escape") {
        setIsEditingTitle(false);
      }
    },
    [handleTitleSave]
  );

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Loading state
  if (thread === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">{t("chatView.loadingThread")}</span>
        </div>
      </div>
    );
  }

  // Thread not found or unauthorized
  if (thread === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t("chatView.threadAccessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PersonaIcon icon={thread.persona.icon} size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="w-full bg-transparent font-display text-sm font-semibold tracking-tight text-foreground outline-none border-b border-primary/30 focus:border-primary"
                maxLength={100}
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleTitleClick()}
                tabIndex={0}
                className="truncate font-display text-sm font-semibold tracking-tight text-foreground cursor-pointer hover:text-primary/80 transition-colors"
                title={t("chatView.editTitleHint")}
              >
                {thread.title}
              </h1>
            )}
            <MemoryStatusSubtitle />
          </div>
        </div>

        {/* Consolidate Memory button */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleConsolidate}
            disabled={consolidating}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title={t("chatView.consolidateMemory")}
          >
            {consolidating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Brain className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{t("chatView.consolidate")}</span>
          </button>
        </div>
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

// =============================================================================
// MemoryStatusSubtitle — inline memory indicator below thread title
// =============================================================================

function MemoryStatusSubtitle() {
  const stats = useQuery(api.userMemory.get);
  const { t } = useTranslation("chat");

  if (!stats || (stats.entityCount === 0 && stats.relationshipCount === 0)) {
    return null;
  }

  const totalMemories = stats.entityCount + stats.relationshipCount;

  return (
    <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
      <span className="truncate">
        {t("memoryStatus.memories", { count: totalMemories.toLocaleString() })}
      </span>
    </p>
  );
}
