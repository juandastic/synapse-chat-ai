import { memo, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { cn, formatMessageTime } from "@/lib/utils";
import { Doc } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { createSecureRehypePlugins } from "@/lib/markdown-security";

interface MessageItemProps {
  message: Doc<"messages">;
  isStreaming?: boolean;
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isError = message.type === "error";
  const isEmpty = message.content === "";
  const prevContentRef = useRef(message.content);
  const isContentChanging = message.content !== prevContentRef.current;
  const hasImages =
    isUser && message.imageKeys !== undefined && message.imageKeys.length > 0;

  useEffect(() => {
    prevContentRef.current = message.content;
  }, [message.content]);

  const isActivelyStreaming =
    !isUser &&
    !isEmpty &&
    (isStreaming || isContentChanging) &&
    message.role === "assistant";

  return (
    <div
      className={cn(
        "group flex w-full animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
              ? "bg-destructive/10 text-destructive"
              : "bg-card text-card-foreground shadow-sm"
        )}
      >
        {hasImages && (
          <div
            className={cn(
              "mb-2 grid gap-1.5",
              message.imageKeys!.length === 1
                ? "grid-cols-1"
                : "grid-cols-2"
            )}
          >
            {message.imageKeys!.map((key) => (
              <MessageImage key={key} imageKey={key} />
            ))}
          </div>
        )}

        {isEmpty && isStreaming ? (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60" />
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        ) : isEmpty && hasImages ? null : isUser ? (
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-display prose-p:text-[15px] prose-p:leading-relaxed prose-p:break-words prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-[14px] prose-pre:bg-muted prose-pre:border prose-pre:border-border">
            <Streamdown
              rehypePlugins={[
                defaultRehypePlugins.raw,
                createSecureRehypePlugins(true), // hardened for AI-generated content
              ]}
              isAnimating={isActivelyStreaming}
            >
              {message.content || ""}
            </Streamdown>
          </div>
        )}

        {isError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs opacity-70">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Error</span>
          </div>
        )}

        {(!isEmpty || hasImages) && (
          <div
            className={cn(
              "mt-1.5 text-[11px] leading-none opacity-0 transition-opacity group-hover:opacity-60",
              isUser
                ? "text-primary-foreground/60"
                : "text-muted-foreground"
            )}
          >
            {formatMessageTime(message._creationTime)}
          </div>
        )}
      </div>
    </div>
  );
});

const MessageImage = memo(function MessageImage({
  imageKey,
}: {
  imageKey: string;
}) {
  const imageUrl = useQuery(api.messages.getImageUrl, { key: imageKey });

  if (!imageUrl) {
    return (
      <div className="aspect-square w-full animate-pulse rounded-lg bg-primary-foreground/10" />
    );
  }

  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg"
    >
      <img
        src={imageUrl}
        alt="Attached image"
        className="h-auto max-h-64 w-full object-cover transition-transform hover:scale-[1.02]"
        loading="lazy"
      />
    </a>
  );
});
