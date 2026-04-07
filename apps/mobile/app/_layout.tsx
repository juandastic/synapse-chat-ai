/**
 * Root Layout — app-wide providers and authentication routing.
 *
 * Provider stack (outermost → innermost):
 *   ClerkProvider            → manages auth sessions, token cache via SecureStore
 *   ConvexProviderWithClerk  → connects Convex backend using Clerk's JWT
 *   PostHogProvider          → analytics, error tracking, screen views
 *   ErrorBoundary            → catches render crashes, reports to PostHog
 *   AuthGate                 → redirects based on sign-in state
 *
 * Route groups:
 *   /(auth)  → onboarding + sign-in (shown when NOT signed in)
 *   /(home)  → main app screens  (shown when signed in)
 *
 * The AuthGate watches `isSignedIn` and automatically redirects between
 * the two groups. Individual screens don't need to check auth state.
 */
import "../src/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Slot, useRouter, useSegments, usePathname } from "expo-router";
import { View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import * as SecureStore from "expo-secure-store";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { captureError } from "../src/lib/analytics";
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext";

/** Watches Clerk loading state — if it doesn't load within timeout, reports error and shows fallback. */
function ClerkLoadingWatchdog({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => {
      console.error("[ClerkWatchdog] Clerk failed to load within 10s");
      captureError(new Error("Clerk failed to load within 10s — possible native_api_disabled or network error"), {
        source: "clerk_watchdog",
      });
      setTimedOut(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (timedOut && !isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>Connection Error</Text>
        <Text style={{ fontSize: 14, textAlign: "center", color: "#666", lineHeight: 20 }}>
          Unable to connect to authentication service. Please check your internet connection and try again.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

/** StatusBar that adapts to the current theme. */
function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}
import { setPostHogInstance } from "../src/lib/analytics";

// ---------------------------------------------------------------------------
// Environment validation — fail fast if required vars are missing
// ---------------------------------------------------------------------------

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const posthogHost =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (!convexUrl) {
  throw new Error(
    "Missing EXPO_PUBLIC_CONVEX_URL — add it to apps/mobile/.env.local"
  );
}
if (!clerkPublishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — add it to apps/mobile/.env.local"
  );
}
if (!posthogApiKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_POSTHOG_KEY — add it to apps/mobile/.env.local"
  );
}

// ---------------------------------------------------------------------------
// Singletons — created once at module load, shared for the app lifetime
// ---------------------------------------------------------------------------

const convex = new ConvexReactClient(convexUrl);

/**
 * Token cache backed by expo-secure-store.
 * Clerk uses this to persist session tokens securely on the device
 * so users stay signed in between app launches.
 */
const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
  async clearToken(key: string) {
    return SecureStore.deleteItemAsync(key);
  },
};

// ---------------------------------------------------------------------------
// Auth gate — handles redirects between (auth) and (home) groups
// ---------------------------------------------------------------------------

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const posthog = usePostHog();
  const prevSignedIn = useRef(isSignedIn);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (isSignedIn && inAuthGroup) {
      // Signed in but viewing auth screens → go to home
      console.log("[AuthGate] Signed in → redirecting to /(home)");
      router.replace("/(home)");
    } else if (!isSignedIn && !inAuthGroup) {
      // Not signed in but viewing home screens → go to onboarding
      console.log("[AuthGate] Not signed in → redirecting to /(auth)");
      router.replace("/(auth)");
    }
  }, [isLoaded, isSignedIn, segments]);

  // Reset PostHog identity when user signs out
  useEffect(() => {
    if (prevSignedIn.current && !isSignedIn) {
      posthog?.reset();
    }
    prevSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  // Don't render anything until Clerk has loaded the session from SecureStore
  if (!isLoaded) return null;

  return <Slot />;
}

/**
 * Initializes the PostHog singleton reference for use outside React
 * (e.g. catch blocks via captureError utility).
 */
function PostHogInit() {
  const posthog = usePostHog();
  useEffect(() => {
    if (posthog) setPostHogInstance(posthog);
  }, [posthog]);
  return null;
}

/**
 * Manually captures screen views for expo-router.
 * expo-router doesn't expose NavigationContainer, so the SDK's
 * built-in captureScreens doesn't work — we use usePathname instead.
 */
function ScreenTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();

  useEffect(() => {
    if (posthog && pathname) {
      posthog.screen(pathname);
    }
  }, [posthog, pathname]);

  return null;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={posthogApiKey!}
      options={{
        host: posthogHost,
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
          },
        },
      }}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
    >
      <PostHogInit />
      <ThemeProvider>
        <ClerkProvider
          publishableKey={clerkPublishableKey!}
          tokenCache={tokenCache}
        >
          <ClerkLoadingWatchdog>
            <ClerkLoaded>
              <ErrorBoundary>
                <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
                  <ScreenTracker />
                  <AuthGate />
                </ConvexProviderWithClerk>
              </ErrorBoundary>
            </ClerkLoaded>
          </ClerkLoadingWatchdog>
        </ClerkProvider>
        <ThemedStatusBar />
      </ThemeProvider>
    </PostHogProvider>
  );
}
