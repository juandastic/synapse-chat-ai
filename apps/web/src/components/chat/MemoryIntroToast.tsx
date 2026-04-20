import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@synapse/backend/api";
import { Brain } from "lucide-react";

const TOAST_DURATION_MS = 10_000;

/**
 * One-shot sonner toast explaining the memory feature. Persists `memoryIntroSeen`
 * on dismiss (manual or auto). Guards against double-firing within the session
 * and double-writing the flag across dismissal paths.
 */
export function MemoryIntroToast() {
  const convexUser = useQuery(api.users.me);
  const setSeen = useMutation(api.users.setMemoryIntroSeen);
  const { i18n } = useTranslation();
  const firedRef = useRef(false);
  const persistedRef = useRef(false);

  useEffect(() => {
    if (!convexUser || convexUser.memoryIntroSeenAt || firedRef.current) return;
    firedRef.current = true;

    const persistOnce = () => {
      if (persistedRef.current) return;
      persistedRef.current = true;
      setSeen().catch(() => {
        persistedRef.current = false;
      });
    };

    const isEs = i18n.language === "es";
    toast(
      isEs
        ? "Synapse recuerda lo que compartes para personalizar respuestas. Puedes ver o eliminar tu memoria en la sección Memoria."
        : "Synapse remembers what you share to personalize responses. You can view or delete your memory in the Memory section.",
      {
        icon: <Brain className="h-4 w-4" />,
        duration: TOAST_DURATION_MS,
        action: {
          label: isEs ? "Entendido" : "Got it",
          onClick: persistOnce,
        },
        onDismiss: persistOnce,
        onAutoClose: persistOnce,
      }
    );
  }, [convexUser?._id, convexUser?.memoryIntroSeenAt, setSeen, i18n.language]);

  return null;
}
