import { useEffect } from "react";
import { usePostHog } from "posthog-react-native";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/expo";
import { api } from "@synapse/backend/api";

/**
 * Identifies the current user in PostHog with their Convex ID,
 * email, name, and plan. Mirrors the web identification in AppLayout.
 */
export function usePostHogIdentify() {
  const posthog = usePostHog();
  const { user } = useUser();
  const convexUser = useQuery(api.users.me);
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);
  const userId = convexUser?._id;
  const name = convexUser?.name;
  const email = user?.primaryEmailAddress?.emailAddress;
  const plan = usageStatus?.plan ?? "free";

  useEffect(() => {
    if (userId && user && posthog) {
      posthog.identify(userId, {
        email: email ?? null,
        name: name ?? null,
      });
      posthog.register({ plan }).catch((error) => {
        console.warn("[PostHog] Could not register plan:", error);
      });
    }
  }, [posthog, userId, name, email, user, plan]);
}
