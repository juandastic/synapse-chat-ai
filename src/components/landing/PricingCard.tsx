import { SignInButton } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { CheckCircle, Heart, Sparkles, Zap } from "lucide-react";
import { color } from "./theme";
import { Reveal } from "./Reveal";

const PRICING_ICONS = [Zap, Sparkles, Heart];

export function PricingCard({
  plan,
  highlighted,
  iconIndex,
  onCtaClick,
}: {
  plan: "free" | "pro" | "therapeutic";
  highlighted?: boolean;
  iconIndex: number;
  onCtaClick: () => void;
}) {
  const { t } = useTranslation("landing");
  const features = t(`pricing.${plan}.features`, { returnObjects: true }) as string[];
  const Icon = PRICING_ICONS[iconIndex];

  return (
    <Reveal delay={iconIndex * 0.08} className="flex">
      <div
        className="relative flex flex-1 flex-col rounded-xl p-6"
        style={{
          border: highlighted
            ? `2px solid ${color.accent}`
            : `1px solid ${color.rule}`,
          background: highlighted ? color.accentLight : "transparent",
        }}
      >
        {highlighted && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ background: color.accent, color: color.paper }}
          >
            {t("pricing.pro.badge")}
          </div>
        )}

        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: `${color.accent}15` }}
        >
          <Icon className="h-5 w-5" style={{ color: color.accent }} />
        </div>

        <h3
          className="mt-3 text-lg font-semibold"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {t(`pricing.${plan}.name`)}
        </h3>

        <div className="mt-2 flex items-baseline gap-1">
          <span
            className="text-2xl font-bold"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t(`pricing.${plan}.price`)}
          </span>
        </div>

        <p
          className="mt-3 text-xs leading-relaxed"
          style={{ color: color.inkMuted }}
        >
          {t(`pricing.${plan}.description`)}
        </p>

        <ul className="mt-5 flex-1 space-y-2.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle
                className="h-3.5 w-3.5 mt-0.5 shrink-0"
                style={{ color: color.accent }}
              />
              <span
                className="text-xs leading-relaxed"
                style={{ color: color.inkMuted }}
              >
                {f}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          {plan === "free" ? (
            <SignInButton mode="modal">
              <button
                onClick={onCtaClick}
                className="w-full rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
                style={{ background: color.ink, color: color.paper }}
              >
                {t("pricing.free.cta")}
              </button>
            </SignInButton>
          ) : (
            <button
              onClick={onCtaClick}
              className="w-full rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
              style={
                highlighted
                  ? { background: color.accent, color: color.paper }
                  : { border: `1px solid ${color.rule}`, color: color.ink }
              }
            >
              {t(`pricing.${plan}.cta`)}
            </button>
          )}
        </div>
      </div>
    </Reveal>
  );
}
