import { useEffect, useRef, Fragment, useCallback, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import { MessageItem } from "./MessageItem";
import { SessionDivider } from "./SessionDivider";
import { Button } from "@/components/ui/button";

export function MessageList() {
  const { messages } = useChatContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevLastMessageContentRef = useRef("");
  const userScrolledUpRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Check if user is near the bottom (within threshold)
  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 150; // pixels from bottom
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((instant = false) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    container.scrollTo({
      top: container.scrollHeight,
      behavior: instant ? "instant" : "smooth",
    });
  }, []);

  // Track user scroll direction to detect intentional scroll-up
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial check - show button if not at bottom on mount
    const checkInitialPosition = () => {
      if (!isNearBottom()) {
        setShowScrollToBottom(true);
      }
    };
    
    // Check after a brief delay to ensure container is rendered
    const timeoutId = setTimeout(checkInitialPosition, 100);

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollingUp = currentScrollTop < lastScrollTopRef.current;
      const nearBottom = isNearBottom();
      
      // If user scrolls up and is not near bottom, mark as intentionally scrolled up
      if (scrollingUp && !nearBottom) {
        userScrolledUpRef.current = true;
      }
      
      // Show button whenever user is not near bottom
      if (!nearBottom) {
        setShowScrollToBottom(true);
      } else {
        // If user scrolls to near bottom, reset the flag and hide button
        userScrolledUpRef.current = false;
        setShowScrollToBottom(false);
      }
      
      lastScrollTopRef.current = currentScrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [isNearBottom]);

  // Auto-scroll on new messages or streaming content updates
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const messageCount = messages.length;
    const lastMessage = messages[messageCount - 1];
    const lastMessageContent = lastMessage?.content || "";
    
    const isFirstLoad = prevMessageCountRef.current === 0;
    const hasNewMessages = messageCount > prevMessageCountRef.current;
    const isStreaming = lastMessageContent !== prevLastMessageContentRef.current;
    const isAssistantStreaming = lastMessage?.role === "assistant" && isStreaming;

    // Update refs
    prevMessageCountRef.current = messageCount;
    prevLastMessageContentRef.current = lastMessageContent;

    // Check scroll position after messages update (in case user was already scrolled up)
    setTimeout(() => {
      if (!isNearBottom()) {
        setShowScrollToBottom(true);
      }
    }, 50);

    // Don't auto-scroll if user has intentionally scrolled up
    if (userScrolledUpRef.current) {
      return;
    }

    // Auto-scroll scenarios:
    // 1. First load - always scroll to bottom instantly
    // 2. New message added - scroll to bottom smoothly
    // 3. Streaming content update - scroll to bottom smoothly
    if (isFirstLoad) {
      scrollToBottom(true);
    } else if (hasNewMessages || isAssistantStreaming) {
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom, isNearBottom]);

  // Loading state
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

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="max-w-sm text-center">
          {/* Decorative element */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 p-5">
            <svg viewBox="0 0 24 24" className="h-full w-full text-primary/60">
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

          <h2 className="font-display text-xl font-semibold text-foreground">
            Start your conversation
          </h2>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            I'm here to listen and support you. Share what's on your mind, and
            we'll explore it together.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={scrollContainerRef} className="h-full overflow-y-auto scroll-smooth">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];
            const showSessionDivider =
              prevMessage && prevMessage.sessionId !== message.sessionId;
            // Use completedAt to determine if still processing (more robust than checking empty content)
            // This prevents infinite loading state if the request fails before writing content
            const isStreaming =
              message.role === "assistant" && message.completedAt === undefined;

            return (
              <Fragment key={message._id}>
                {showSessionDivider && (
                  <SessionDivider timestamp={message._creationTime} />
                )}
                <MessageItem message={message} isStreaming={isStreaming} />
              </Fragment>
            );
          })}
          {/* Spacer at bottom for better UX */}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>
      
      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Button
            onClick={() => {
              scrollToBottom(false);
              userScrolledUpRef.current = false;
              setShowScrollToBottom(false);
            }}
            size="icon"
            className="h-10 w-10 rounded-full shadow-lg transition-all hover:scale-110"
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
    </>
  );
}
