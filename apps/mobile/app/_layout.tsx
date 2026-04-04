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
import { useEffect, useRef } from "react";
import { Slot, useRouter, useSegments, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import * as SecureStore from "expo-secure-store";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
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
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
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
            <ScreenTracker />
            <ErrorBoundary>
              <AuthGate />
            </ErrorBoundary>
            <StatusBar style="auto" />
          </PostHogProvider>
        </ConvexProviderWithClerk>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
