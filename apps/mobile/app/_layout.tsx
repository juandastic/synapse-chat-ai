/**
 * Root Layout — app-wide providers and authentication routing.
 *
 * Provider stack (outermost → innermost):
 *   ClerkProvider        → manages auth sessions, token cache via SecureStore
 *   ConvexProviderWithClerk → connects Convex backend using Clerk's JWT
 *   AuthGate             → redirects based on sign-in state
 *
 * Route groups:
 *   /(auth)  → onboarding + sign-in (shown when NOT signed in)
 *   /(home)  → main app screens  (shown when signed in)
 *
 * The AuthGate watches `isSignedIn` and automatically redirects between
 * the two groups. Individual screens don't need to check auth state.
 */
import "../src/i18n";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";

// ---------------------------------------------------------------------------
// Environment validation — fail fast if required vars are missing
// ---------------------------------------------------------------------------

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

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

  // Don't render anything until Clerk has loaded the session from SecureStore
  if (!isLoaded) return null;

  return <Slot />;
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
          <AuthGate />
          <StatusBar style="auto" />
        </ConvexProviderWithClerk>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
