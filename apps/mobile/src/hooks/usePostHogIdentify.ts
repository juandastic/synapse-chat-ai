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

  useEffect(() => {
    if (convexUser && user && posthog) {
      posthog.identify(convexUser._id, {
        email: user.primaryEmailAddress?.emailAddress ?? null,
        name: convexUser.name,
      });
      posthog.register({ plan: usageStatus?.plan ?? "free" });
    }
  }, [posthog, convexUser?._id, user, usageStatus?.plan]);
}
