import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { toast } from "sonner";
import { X } from "lucide-react";
import { color } from "./theme";

export function ContactModal({
  plan,
  onClose,
}: {
  plan: "pro" | "therapeutic";
  onClose: () => void;
}) {
  const { t } = useTranslation("landing");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    posthog.capture("contact_form_submitted", {
      plan,
      name,
      email,
      message,
      source: "landing",
    });

    await new Promise((r) => setTimeout(r, 300));
    setSubmitting(false);
    toast.success(t("contactModal.success"));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(44, 36, 24, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{ background: color.paper, color: color.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ background: color.accentLight }}
          aria-label={t("contactModal.close")}
        >
          <X className="h-4 w-4" style={{ color: color.ink }} />
        </button>

        <h3
          className="text-xl font-semibold"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {t("contactModal.title")}
        </h3>
        <p className="mt-1 text-xs" style={{ color: color.inkMuted }}>
          {t("contactModal.description")}
        </p>
        <p className="mt-1 text-xs font-medium" style={{ color: color.accent }}>
          {t("contactModal.plan", { plan: t(`pricing.${plan}.name`) })}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              {t("contactModal.nameLabel")}
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("contactModal.namePlaceholder")}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ border: `1px solid ${color.rule}`, background: "transparent" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = color.accent)}
              onBlur={(e) => (e.currentTarget.style.borderColor = color.rule)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {t("contactModal.emailLabel")}
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("contactModal.emailPlaceholder")}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ border: `1px solid ${color.rule}`, background: "transparent" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = color.accent)}
              onBlur={(e) => (e.currentTarget.style.borderColor = color.rule)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {t("contactModal.messageLabel")}
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("contactModal.messagePlaceholder")}
              rows={4}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors"
              style={{ border: `1px solid ${color.rule}`, background: "transparent" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = color.accent)}
              onBlur={(e) => (e.currentTarget.style.borderColor = color.rule)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: color.accent, color: color.paper }}
          >
            {submitting ? t("contactModal.submitting") : t("contactModal.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
