import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map i18n language codes to full locale codes */
function resolveLocale(lang?: string): string | undefined {
  if (!lang) return undefined;
  const map: Record<string, string> = { en: "en-US", es: "es-ES" };
  return map[lang] ?? undefined;
}

/**
 * Format a full date/time for session dividers
 */
export function formatSessionDate(timestamp: number, locale?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a message timestamp to show the time (e.g., "2:30 PM")
 */
export function formatMessageTime(timestamp: number, locale?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(resolveLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getRelativeTime(timestamp: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return t("time.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("time.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return t("time.daysAgo", { count: diffDay });
  const diffMonth = Math.floor(diffDay / 30);
  return t("time.monthsAgo", { count: diffMonth });
}
