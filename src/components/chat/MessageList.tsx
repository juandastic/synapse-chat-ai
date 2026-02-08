import { useEffect, useRef, Fragment, useCallback, useState } from "react";
import { useChatContext } from "@/contexts/useChatContext";
import { MessageItem } from "./MessageItem";
import { SessionDivider } from "./SessionDivider";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  personaIcon?: string;
  personaName?: string;
}

export function MessageList({ personaIcon, personaName }: MessageListProps) {
  const { messages } = useChatContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ── Is user at the very bottom? ─────────────────────────────────────
  const isAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight < 30
    );
  }, [messages]);

  // ── Scroll to bottom ────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  // ── Show / hide button based on scroll position ─────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShowScrollButton(!isAtBottom());
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isAtBottom]);

  // ── Scroll to bottom ONLY when a new message is added ───────────────
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const messageCount = messages.length;
    const isFirstLoad = prevMessageCountRef.current === 0;
    const hasNewMessage = messageCount > prevMessageCountRef.current;

    prevMessageCountRef.current = messageCount;

    if (isFirstLoad) {
      // First load — jump instantly (no animation)
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
        // Update button state after jump
        setShowScrollButton(false);
      });
    } else if (hasNewMessage) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // ── Loading state ───────────────────────────────────────────────────
  if (messages === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading conversation...</span>
        </div>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="max-w-sm text-center">
          {personaIcon ? (
            <div className="mx-auto mb-6 text-5xl">{personaIcon}</div>
          ) : (
            <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 p-5">
              <svg
                viewBox="0 0 24 24"
                className="h-full w-full text-primary/60"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
          )}

          <h2 className="font-display text-xl font-semibold text-foreground">
            {personaName
              ? `Start your conversation with ${personaName}`
              : "Start your conversation"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            Share what's on your mind, and we'll explore it together.
          </p>
        </div>
      </div>
    );
  }

  // ── Message list ────────────────────────────────────────────────────
  return (
    <div className="relative h-full">
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];
            const showSessionDivider =
              prevMessage && prevMessage.sessionId !== message.sessionId;
            const isStreaming =
              message.role === "assistant" &&
              message.completedAt === undefined;

            return (
              <Fragment key={message._id}>
                {showSessionDivider && (
                  <SessionDivider timestamp={message._creationTime} />
                )}
                <div className="message-item">
                  <MessageItem message={message} isStreaming={isStreaming} />
                </div>
              </Fragment>
            );
          })}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Button
            onClick={() => {
              scrollToBottom();
              setShowScrollButton(false);
            }}
            size="icon"
            className="pointer-events-auto h-10 w-10 rounded-full shadow-lg transition-all hover:scale-110"
            aria-label="Scroll to bottom"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </Button>
        </div>
      )}
    </div>
  );
}
