import { useCallback } from "react";
import { Alert } from "react-native";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/expo";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { useChatContext } from "../contexts/useChatContext";

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";
const CONVEX_SITE_URL = CONVEX_URL.replace(".cloud", ".site");

/**
 * Stream AI response using XMLHttpRequest.
 *
 * React Native (Hermes on iOS) does not support `response.body` (ReadableStream)
 * from fetch(). We use XMLHttpRequest with responseType "text" and onprogress
 * to read partial response text as it arrives.
 *
 * The Convex /chat endpoint streams raw text content (not SSE) —
 * each chunk is a plain text fragment of the assistant's response.
 */
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

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${CONVEX_SITE_URL}/chat`);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.responseType = "text";

          let lastLength = 0;

          xhr.onprogress = () => {
            // xhr.responseText contains all data received so far
            const currentText = xhr.responseText;
            if (currentText.length > lastLength) {
              lastLength = currentText.length;
              updateStreamedContent(currentText);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              // Final update with complete content
              if (xhr.responseText.length > lastLength) {
                updateStreamedContent(xhr.responseText);
              }
              resolve();
            } else if (xhr.status === 429) {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || "Usage limit reached"));
              } catch {
                reject(new Error("Usage limit reached"));
              }
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Network error"));
          };

          xhr.ontimeout = () => {
            reject(new Error("Request timed out"));
          };

          xhr.timeout = 120000; // 2 minute timeout

          xhr.send(
            JSON.stringify({
              sessionId,
              threadId,
              assistantMessageId,
            })
          );
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Stream failed. Please try again.";
        console.error("[useStreamResponse] Stream failed:", err);
        stopStreaming();
        Alert.alert("Error", message);
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
    },
    [getToken, threadId, updateStreamedContent, stopStreaming, reportStreamFailure]
  );
}
