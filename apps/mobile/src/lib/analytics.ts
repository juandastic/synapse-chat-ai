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

  posthogInstance?.capture("$exception", {
    $exception_message: message,
    $exception_type: type,
    $exception_source: context.source,
    platform: "mobile",
    ...context,
  });
}
