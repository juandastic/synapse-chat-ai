import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  lightColors,
  darkColors,
  type ColorPalette,
} from "../constants/colors";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  colors: ColorPalette;
  toggleTheme: () => void;
}

const STORAGE_KEY = "synapse-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>(
    systemScheme === "dark" ? "dark" : "light"
  );
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved === "light" || saved === "dark") {
          setTheme(saved);
        }
      } catch {
        // Ignore — use default
      }
      setLoaded(true);
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const colors = theme === "dark" ? darkColors : lightColors;

  const value = useMemo(
    () => ({ theme, colors, toggleTheme }),
    [theme, colors, toggleTheme]
  );

  // Don't render until we've loaded the saved preference to avoid flash
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Returns the current theme, color palette, and toggle function. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Shortcut — returns just the current color palette. */
export function useColors(): ColorPalette {
  return useTheme().colors;
}
