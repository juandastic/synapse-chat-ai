import { useCallback } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { useChatContext } from "@/contexts/useChatContext";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_URL.replace(
  ".cloud",
  ".site"
);

export function useStreamResponse() {
  const { threadId, updateStreamedContent, stopStreaming } = useChatContext();
  const reportStreamFailure = useMutation(api.messages.reportStreamFailure);
  const { getToken } = useAuth();

  return useCallback(
    async (
      assistantMessageId: Id<"messages">,
      sessionId: Id<"sessions">
    ) => {
      try {
        const token = await getToken({ template: "convex" });
        const response = await fetch(`${CONVEX_SITE_URL}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            threadId,
            assistantMessageId,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const data = await response.json().catch(() => ({}));
            throw new Error(
              data.error || "Usage limit reached"
            );
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is empty");
        }

        const decoder = new TextDecoder();
        let accumulated = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            updateStreamedContent(accumulated);
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Stream failed. Please try again.";
        console.error("[useStreamResponse] Stream failed:", err);

        stopStreaming();

        const isNetworkError = message === "Failed to fetch" || message === "Load failed";
        if (!isNetworkError) {
          toast.error(message);
          try {
            await reportStreamFailure({
              messageId: assistantMessageId,
              errorMessage:
                "I'm having trouble responding right now. Please try again.",
            });
          } catch (reportErr) {
            console.error(
              "[useStreamResponse] Failed to report stream failure:",
              reportErr
            );
          }
        }
      }
    },
    [getToken, threadId, updateStreamedContent, stopStreaming, reportStreamFailure]
  );
}
