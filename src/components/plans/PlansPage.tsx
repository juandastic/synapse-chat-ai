import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  ArrowLeft,
  CheckCircle,
  Heart,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

// =============================================================================
// Contact Modal
// =============================================================================

function ContactModal({
  plan,
  userId,
  onClose,
}: {
  plan: "pro" | "therapeutic";
  userId?: string;
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
      user_id: userId,
      source: "in_app",
    });

    await new Promise((r) => setTimeout(r, 300));
    setSubmitting(false);
    toast.success(t("contactModal.success"));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("contactModal.close")}
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="font-display text-lg font-semibold text-foreground">
          {t("contactModal.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("contactModal.description")}
        </p>
        <p className="mt-1 text-xs font-medium text-primary">
          {t("contactModal.plan", { plan: t(`pricing.${plan}.name`) })}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {t("contactModal.nameLabel")}
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("contactModal.namePlaceholder")}
              className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {t("contactModal.emailLabel")}
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("contactModal.emailPlaceholder")}
              className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {t("contactModal.messageLabel")}
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("contactModal.messagePlaceholder")}
              rows={4}
              className="w-full rounded-lg border border-border/50 bg-card px-3 py-2.5 text-sm leading-relaxed focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? t("contactModal.submitting") : t("contactModal.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Plan Card
// =============================================================================

const PLAN_ICONS = [Zap, Sparkles, Heart];

function PlanCard({
  plan,
  highlighted,
  iconIndex,
  isCurrent,
  onCtaClick,
}: {
  plan: "free" | "pro" | "therapeutic";
  highlighted?: boolean;
  iconIndex: number;
  isCurrent?: boolean;
  onCtaClick: () => void;
}) {
  const { t } = useTranslation("landing");
  const ts = useTranslation("settings").t;
  const features = t(`pricing.${plan}.features`, { returnObjects: true }) as string[];
  const Icon = PLAN_ICONS[iconIndex];

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 ${
        highlighted
          ? "border-primary/40 bg-primary/5"
          : "border-border/50 bg-card"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground">
          {t("pricing.pro.badge")}
        </div>
      )}

      {isCurrent && (
        <div className="absolute top-3 right-3 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          {ts("plansPage.currentPlan")}
        </div>
      )}

      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
        {t(`pricing.${plan}.name`)}
      </h3>

      <div className="mt-2">
        <span className="font-display text-2xl font-bold text-foreground">
          {t(`pricing.${plan}.price`)}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t(`pricing.${plan}.description`)}
      </p>

      <ul className="mt-5 flex-1 space-y-2.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {f}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <button
          onClick={onCtaClick}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all active:scale-[0.98] ${
            highlighted
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border/50 text-foreground hover:bg-muted"
          }`}
        >
          {t(`pricing.${plan}.cta`)}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Plans Page
// =============================================================================

export function PlansPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");
  const ts = useTranslation("settings").t;
  const tc = useTranslation("common").t;

  const convexUser = useQuery(api.users.me);
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);

  const [contactModalPlan, setContactModalPlan] = useState<"pro" | "therapeutic" | null>(null);

  const currentPlan = usageStatus?.plan ?? "free";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={tc("goBack")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-sm font-semibold tracking-tight text-foreground">
          {ts("plansPage.title")}
        </h1>

        {usageStatus && usageStatus.dailyMessages.limit !== -1 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {ts("plansPage.usage", {
              used: usageStatus.dailyMessages.used,
              limit: usageStatus.dailyMessages.limit,
            })}
          </span>
        )}
      </header>

      {/* Content */}
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <p className="text-sm text-muted-foreground">
          {t("pricing.description")}
        </p>

        <div className="mt-8 grid md:grid-cols-3 gap-5">
          <PlanCard
            plan="free"
            iconIndex={0}
            isCurrent={currentPlan === "free"}
            onCtaClick={() => {
              posthog.capture("pricing_plan_selected", {
                plan: "free",
                source: "in_app",
                user_id: convexUser?._id,
              });
              navigate("/");
            }}
          />
          <PlanCard
            plan="pro"
            highlighted
            iconIndex={1}
            isCurrent={currentPlan === "pro"}
            onCtaClick={() => {
              posthog.capture("pricing_plan_selected", {
                plan: "pro",
                source: "in_app",
                user_id: convexUser?._id,
              });
              setContactModalPlan("pro");
            }}
          />
          <PlanCard
            plan="therapeutic"
            iconIndex={2}
            onCtaClick={() => {
              posthog.capture("pricing_plan_selected", {
                plan: "therapeutic",
                source: "in_app",
                user_id: convexUser?._id,
              });
              setContactModalPlan("therapeutic");
            }}
          />
        </div>
      </div>

      {contactModalPlan !== null && (
        <ContactModal
          plan={contactModalPlan}
          userId={convexUser?._id}
          onClose={() => setContactModalPlan(null)}
        />
      )}
    </div>
  );
}
