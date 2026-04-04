/**
 * Shared color tokens for the Synapse mobile app.
 *
 * These match the web landing page theme (warm paper aesthetic).
 * Import this instead of defining colors inline in each screen.
 */
export const colors = {
  /** Warm cream background — the "paper" base */
  paper: "#f5f0e8",
  /** Primary text — dark brown */
  ink: "#2c2418",
  /** Secondary/muted text */
  inkMuted: "#6b5e4f",
  /** Brand accent — warm brown used for highlights, icons, tags */
  accent: "#8b5e3c",
  /** Very light accent fill for badges and cards */
  accentLight: "rgba(139, 94, 60, 0.08)",
  /** Subtle border/divider color */
  rule: "rgba(44, 36, 24, 0.1)",
  /** Pure white for input backgrounds, chat bubbles */
  white: "#ffffff",
  /** Destructive action color (sign out, errors) */
  error: "#c0392b",
  /** Card background — slightly lighter than paper, for assistant bubbles */
  card: "#faf7f2",
  /** Primary action color (send button, active states) */
  primary: "#8b5e3c",
  /** Text on primary-colored surfaces */
  primaryForeground: "#faf7f2",
  /** Warning color for usage limits */
  amber: "#d97706",
} as const;
