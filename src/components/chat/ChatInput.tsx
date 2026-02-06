import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";
import { useChatContext } from "@/contexts/useChatContext";

export function ChatInput() {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isGenerating, threadId } = useChatContext();
  const sendMessage = useMutation(api.messages.send);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSubmitting || isGenerating) return;

    setIsSubmitting(true);
    setError(null);
    setContent("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage({ threadId, content: trimmedContent });
    } catch (err) {
      // Restore content on error so the user doesn't lose their message
      setContent(trimmedContent);
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      console.error("[ChatInput] Failed to send message:", err);
    } finally {
      setIsSubmitting(false);
      textareaRef.current?.focus();
    }
  }, [content, isSubmitting, isGenerating, sendMessage, threadId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const isDisabled = isSubmitting || isGenerating;
  const canSubmit = content.trim().length > 0 && !isDisabled;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="relative flex items-end gap-2 rounded-2xl border border-border/50 bg-card p-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/20">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError(null);
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isGenerating
              ? "Waiting for response..."
              : "Share what's on your mind..."
          }
          disabled={isDisabled}
          rows={1}
          className={cn(
            "max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50",
            isDisabled && "cursor-not-allowed"
          )}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
            canSubmit
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          aria-label="Send message"
        >
          {isDisabled ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p
          className="mt-2 text-center text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="mt-2 text-center text-xs text-muted-foreground/60">
        Press Enter to send, Shift + Enter for new line
      </p>
    </div>
  );
}
