/** Map i18n language codes to full locale codes */
function resolveLocale(lang?: string): string | undefined {
  if (!lang) return undefined;
  const map: Record<string, string> = { en: "en-US", es: "es-ES" };
  return map[lang] ?? undefined;
}

/**
 * Format a full date/time for session dividers.
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
 * Format a message timestamp to show the time (e.g., "2:30 PM").
 */
export function formatMessageTime(timestamp: number, locale?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(resolveLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}
