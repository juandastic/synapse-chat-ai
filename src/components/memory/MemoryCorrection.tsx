import { useState, useCallback, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Send, Loader2 } from "lucide-react";

interface MemoryCorrectionProps {
  /** Called after a successful correction so the parent can re-fetch the graph */
  onCorrectionSent: () => void;
}

/**
 * NLP-based memory correction input.
 *
 * The user types a natural-language correction (e.g., "I no longer live in
 * Colombia, I moved to Canada") and the backend processes it through Graphiti
 * to invalidate outdated edges and create new ones.
 */
export function MemoryCorrection({ onCorrectionSent }: MemoryCorrectionProps) {
  const correctMemory = useAction(api.graph.correct);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const result = await correctMemory({ correctionText: trimmed });

      if (result.success) {
        setText("");
        setFeedback({
          type: "success",
          message: "Correction queued. Processing in the background...",
        });
        onCorrectionSent();

        // Clear success feedback after a few seconds
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({
          type: "error",
          message: result.error ?? "Something went wrong",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to send correction. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [text, loading, correctMemory, onCorrectionSent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="border-t border-border/50 bg-card/50 px-4 py-3">
      {/* Hint text */}
      <p className="mb-2 text-[11px] text-muted-foreground/60">
        Is something incorrect? Describe the change in your own words and
        Synapse will update its memory.
      </p>

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "I no longer work at Acme Corp, I joined NewCo last month."'
          disabled={loading}
          rows={2}
          className={cn(
            "flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40",
            "focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          aria-label="Send correction"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Feedback message */}
      {feedback && (
        <p
          className={cn(
            "mt-2 text-xs",
            feedback.type === "success"
              ? "text-primary"
              : "text-destructive"
          )}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
