import { memo, useRef, useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
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
              "mt-1.5 flex items-center gap-2 text-[11px] leading-none opacity-0 transition-opacity group-hover:opacity-60",
              isUser
                ? "text-primary-foreground/60"
                : "text-muted-foreground"
            )}
          >
            <span>{formatMessageTime(message._creationTime)}</span>
            {!isUser && !isEmpty && (
              <CopyMarkdownButton content={message.content} />
            )}
            <DeleteMessageButton messageId={message._id} isUserMessage={isUser} />
          </div>
        )}
      </div>
    </div>
  );
});

const CopyMarkdownButton = memo(function CopyMarkdownButton({
  content,
}: {
  content: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      title="Copy as Markdown"
      aria-label="Copy as Markdown"
    >
      {copied ? (
        <>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="text-[10px]">Copied</span>
        </>
      ) : (
        <>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className="text-[10px]">MD</span>
        </>
      )}
    </button>
  );
});

const DeleteMessageButton = memo(function DeleteMessageButton({
  messageId,
  isUserMessage,
}: {
  messageId: Doc<"messages">["_id"];
  isUserMessage: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const deleteMessage = useMutation(api.messages.deleteMessage);

  const handleDelete = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 3 seconds if user doesn't confirm
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await deleteMessage({ messageId });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
    setConfirming(false);
  }, [confirming, deleteMessage, messageId]);

  return (
    <button
      type="button"
      onClick={handleDelete}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        confirming
          ? isUserMessage
            ? "bg-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/35"
            : "bg-destructive/20 text-destructive hover:bg-destructive/30"
          : "hover:bg-muted-foreground/10"
      )}
      title={confirming ? "Click again to confirm" : "Delete message"}
      aria-label={confirming ? "Confirm delete" : "Delete message"}
    >
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
      <span className="text-[10px]">{confirming ? "Sure?" : "Delete"}</span>
    </button>
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
