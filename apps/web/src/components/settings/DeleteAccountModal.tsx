import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { api } from "@synapse/backend/api";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
}

const SIGN_OUT_DELAY_MS = 2500;

export function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps) {
  const { i18n } = useTranslation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const convexUser = useQuery(api.users.me);
  const navigate = useNavigate();

  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isEs = i18n.language === "es";

  useEffect(() => {
    if (!open) {
      setAcknowledged(false);
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [open]);

  // Escape to close, but not while we're signing the user out.
  useEffect(() => {
    if (!open || submitted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, submitted, onClose]);

  const handleConfirm = async () => {
    if (!acknowledged || submitting) return;
    setSubmitting(true);

    posthog.capture("account_deletion_requested", {
      user_id: convexUser?._id,
      email: user?.primaryEmailAddress?.emailAddress,
      requested_at: Date.now(),
    });

    setSubmitted(true);
    toast.success(
      isEs ? "Solicitud de eliminación enviada" : "Deletion request submitted"
    );

    await new Promise((r) => setTimeout(r, SIGN_OUT_DELAY_MS));

    try {
      await signOut();
    } catch {
      /* ignore; we still navigate home */
    }
    navigate("/");
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-200" />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200"
      >
        {!submitted && !submitting && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isEs ? "Cerrar" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {submitted ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-primary"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-base font-semibold">
              {isEs ? "Solicitud enviada" : "Request submitted"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {isEs
                ? "Tu cuenta y todos los datos asociados se eliminarán dentro de 30 días. Te estamos cerrando sesión ahora."
                : "Your account and all associated data will be deleted within 30 days. We're signing you out now."}
            </p>
          </div>
        ) : (
          <>
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="delete-account-title"
                    className="text-base font-semibold text-foreground"
                  >
                    {isEs ? "¿Eliminar tu cuenta?" : "Delete your account?"}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {isEs
                      ? "Esto eliminará permanentemente lo siguiente dentro de 30 días:"
                      : "This will permanently delete the following within 30 days:"}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <li>
                      •{" "}
                      {isEs
                        ? "Todos tus hilos, mensajes e imágenes"
                        : "All your threads, messages, and uploaded images"}
                    </li>
                    <li>
                      •{" "}
                      {isEs
                        ? "Tu grafo de memoria y hechos extraídos"
                        : "Your memory graph and extracted facts"}
                    </li>
                    <li>
                      •{" "}
                      {isEs
                        ? "Tu información de cuenta y preferencias"
                        : "Your account info and preferences"}
                    </li>
                  </ul>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {isEs
                      ? "Esta acción no se puede deshacer. Si tienes un plan activo, cancélalo por separado con el procesador de pagos."
                      : "This cannot be undone. If you have an active plan, cancel it separately with the payment processor."}
                  </p>

                  <label className="mt-4 flex cursor-pointer select-none items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      disabled={submitting}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <span className="text-muted-foreground">
                      {isEs
                        ? "Entiendo que esto no se puede deshacer."
                        : "I understand this cannot be undone."}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-4">
              <button
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {isEs ? "Cancelar" : "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!acknowledged || submitting}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {submitting
                  ? isEs
                    ? "Enviando..."
                    : "Submitting..."
                  : isEs
                    ? "Eliminar cuenta"
                    : "Delete account"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
