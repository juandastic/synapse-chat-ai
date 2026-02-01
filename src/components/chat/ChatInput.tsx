import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";
import { useChatContext } from "@/contexts/ChatContext";

export function ChatInput() {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isGenerating } = useChatContext();
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
    setContent("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage({ content: trimmedContent });
    } catch (error) {
      // Restore content on error
      setContent(trimmedContent);
      console.error("Failed to send message:", error);
    } finally {
      setIsSubmitting(false);
      // Refocus textarea
      textareaRef.current?.focus();
    }
  }, [content, isSubmitting, isGenerating, sendMessage]);

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
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={isGenerating ? "Waiting for response..." : "Share what's on your mind..."}
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

      <p className="mt-2 text-center text-xs text-muted-foreground/60">
        Press Enter to send, Shift + Enter for new line
      </p>
    </div>
  );
}
