import type { PostHog } from "posthog-react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

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
  const rawStack = errorObj.stack?.slice(0, 8_000);
  const cause = "cause" in errorObj
    ? (errorObj as Error & { cause?: unknown }).cause
    : undefined;
  const causeType = cause instanceof Error ? cause.name : undefined;
  const causeMessage = cause instanceof Error
    ? cause.message
        .replace(/https?:\/\/\S+/gi, "[redacted-url]")
        .replace(/(?:file|content):\/\/\S+/gi, "[redacted-file-uri]")
        .slice(0, 500)
    : undefined;

  console.log("[captureError] Sending to PostHog:", {
    type,
    message,
    source: context.source,
    action: context.action,
  });
  posthogInstance.captureException(errorObj, {
    $exception_source: context.source,
    platform: "mobile",
    error_name: type,
    error_message: message,
    ...(rawStack ? { error_stack: rawStack } : {}),
    ...(causeType ? { error_cause_name: causeType } : {}),
    ...(causeMessage ? { error_cause_message: causeMessage } : {}),
    ...(Constants.expoConfig?.version
      ? { app_version: Constants.expoConfig.version }
      : {}),
    ...(typeof Constants.expoConfig?.runtimeVersion === "string"
      ? { runtime_version: Constants.expoConfig.runtimeVersion }
      : {}),
    os_name: Platform.OS,
    os_version: String(Platform.Version),
    ...context,
  });
}
