/**
 * Shared color tokens for the Synapse mobile app.
 *
 * Light palette matches the web landing page theme (warm paper aesthetic).
 * Dark palette matches the web dark mode (warm dark tones).
 *
 * Components should use `useColors()` from ThemeContext instead of
 * importing these directly, so they respond to theme changes.
 */

export interface ColorPalette {
  paper: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentLight: string;
  rule: string;
  white: string;
  error: string;
  errorLight: string;
  card: string;
  primary: string;
  primaryForeground: string;
  amber: string;
}

/** Light mode — warm cream/paper aesthetic */
export const lightColors: ColorPalette = {
  paper: "#f5f0e8",
  ink: "#2c2418",
  inkMuted: "#6b5e4f",
  accent: "#8b5e3c",
  accentLight: "rgba(139, 94, 60, 0.08)",
  rule: "rgba(44, 36, 24, 0.1)",
  white: "#ffffff",
  error: "#c0392b",
  errorLight: "rgba(192, 57, 43, 0.08)",
  card: "#faf7f2",
  primary: "#8b5e3c",
  primaryForeground: "#faf7f2",
  amber: "#d97706",
};

/** Dark mode — warm dark tones matching web .dark palette */
export const darkColors: ColorPalette = {
  paper: "#1c1814",
  ink: "#e8dfcf",
  inkMuted: "#9a8e7f",
  accent: "#c4975a",
  accentLight: "rgba(196, 151, 90, 0.12)",
  rule: "rgba(232, 223, 207, 0.1)",
  white: "#252018",
  error: "#c0392b",
  errorLight: "rgba(192, 57, 43, 0.12)",
  card: "#242019",
  primary: "#c4975a",
  primaryForeground: "#1c1814",
  amber: "#d97706",
};

/**
 * @deprecated Use `useColors()` from ThemeContext instead.
 * Kept for backward compatibility during migration.
 */
export const colors = lightColors;
