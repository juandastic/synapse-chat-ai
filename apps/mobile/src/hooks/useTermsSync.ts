import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@synapse/backend/api";

/**
 * Fire-and-forget call on mount. The backend mutation is idempotent — it
 * early-returns if `termsConfirmedAt` is already set. Intentionally does NOT
 * subscribe to the user doc to avoid a reactive listener for a one-shot
 * eventual side effect. Mirrors the web AppLayout behavior.
 */
export function useTermsSync() {
  const confirmTerms = useMutation(api.users.confirmTerms);

  useEffect(() => {
    confirmTerms().catch(() => {
      /* non-critical; will retry on next mount */
    });
  }, [confirmTerms]);
}
