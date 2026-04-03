import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL!;
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const convex = new ConvexReactClient(convexUrl);

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

function AuthGate() {
  const { isLoaded } = useAuth();

  // TODO: Add auth redirect once sign-in screen is created
  // const { isSignedIn } = useAuth();
  // const segments = useSegments();
  // const router = useRouter();
  // useEffect(() => {
  //   if (!isLoaded) return;
  //   if (!isSignedIn && segments[0] !== "(auth)") {
  //     router.replace("/(auth)/sign-in");
  //   }
  // }, [isLoaded, isSignedIn, segments]);

  if (!isLoaded) return null;

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
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
