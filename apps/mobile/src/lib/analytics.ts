import type { PostHog } from "posthog-react-native";

let posthogInstance: PostHog | null = null;

export function setPostHogInstance(ph: PostHog) {
  posthogInstance = ph;
}

/**
 * Capture an error as a PostHog $exception event.
 * Safe to call even if PostHog is not yet initialized.
 */
export function captureError(
  error: unknown,
  context: { source: string; [key: string]: unknown }
) {
  const message =
    error instanceof Error ? error.message : String(error);
  const type =
    error instanceof Error ? error.name : "UnknownError";

  if (!posthogInstance) {
    console.warn("[captureError] PostHog not initialized yet, error not sent:", message);
    return;
  }

  const errorObj = error instanceof Error ? error : new Error(message);
  console.log("[captureError] Sending to PostHog:", { type, message, source: context.source });
  posthogInstance.captureException(errorObj, {
    $exception_source: context.source,
    platform: "mobile",
    ...context,
  });
}
