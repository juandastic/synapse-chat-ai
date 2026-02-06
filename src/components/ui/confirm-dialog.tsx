import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";

type DialogVariant = "danger" | "info";

interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Called when the user confirms the action */
  onConfirm: () => void;
  /** Called when the user cancels or presses Escape */
  onCancel: () => void;
  /** Dialog title */
  title: string;
  /** Main description (can include line breaks via \n) */
  description: string;
  /** Optional secondary hint shown below the description */
  hint?: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Visual variant — "danger" for destructive actions, "info" for notices */
  variant?: DialogVariant;
  /** Whether the confirm button is in a loading/disabled state */
  loading?: boolean;
}

/**
 * A styled confirmation dialog that replaces native confirm/alert.
 * Renders as a centered modal with a backdrop overlay.
 * Supports "danger" (destructive) and "info" (informational) variants.
 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  hint,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the confirm button when opened
  useEffect(() => {
    if (open) {
      // Small timeout to allow the animation to start
      const timer = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  // Trap focus inside the dialog
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCancel();
      }
    },
    [onCancel]
  );

  if (!open) return null;

  const isDanger = variant === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isDanger
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isDanger ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Info className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold text-foreground"
              >
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                {description}
              </p>
              {hint && (
                <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50",
              isDanger
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Deleting…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
