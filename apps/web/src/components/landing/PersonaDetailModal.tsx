import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CheckCircle, Target, X } from "lucide-react";
import { color } from "./theme";

// =============================================================================
// Types
// =============================================================================

export interface PersonaDetail {
  subtitle: string;
  theories: Array<{ name: string; desc: string }>;
  useCases: string[];
  approach: string;
}

export interface PersonaItem {
  emoji: string;
  name: string;
  desc: string;
  detail: PersonaDetail;
}

// =============================================================================
// Component
// =============================================================================

export function PersonaDetailModal({
  persona,
  icon: Icon,
  onClose,
}: {
  persona: PersonaItem;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  onClose: () => void;
}) {
  const { t } = useTranslation("landing");

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

  const { detail } = persona;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(44, 36, 24, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-8 sm:p-10"
        style={{ background: color.paper, color: color.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ background: color.accentLight }}
          aria-label={t("personas.modal.close")}
        >
          <X className="h-4 w-4" style={{ color: color.ink }} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${color.accent}15` }}
          >
            <Icon className="h-6 w-6" style={{ color: color.accent }} />
          </div>
          <div>
            <h3
              className="text-2xl font-semibold"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {persona.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: color.inkMuted }}>
              {detail.subtitle}
            </p>
          </div>
        </div>

        {/* Approach summary */}
        <p
          className="mt-5 text-sm leading-relaxed"
          style={{ color: color.inkMuted }}
        >
          {detail.approach}
        </p>

        {/* Theoretical foundations */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4" style={{ color: color.accent }} />
            <h4
              className="text-sm font-semibold uppercase tracking-[0.15em]"
              style={{ color: color.accent }}
            >
              {t("personas.modal.theoreticalFoundations")}
            </h4>
          </div>
          <div className="space-y-4">
            {detail.theories.map((theory, i) => (
              <div
                key={i}
                className="rounded-lg p-4"
                style={{ background: color.accentLight, border: `1px solid ${color.rule}` }}
              >
                <h5 className="text-sm font-semibold mb-1">{theory.name}</h5>
                <p className="text-xs leading-relaxed" style={{ color: color.inkMuted }}>
                  {theory.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Use cases */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4" style={{ color: color.accent }} />
            <h4
              className="text-sm font-semibold uppercase tracking-[0.15em]"
              style={{ color: color.accent }}
            >
              {t("personas.modal.perfectFor")}
            </h4>
          </div>
          <ul className="space-y-3">
            {detail.useCases.map((useCase, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  style={{ color: color.accent }}
                />
                <span className="text-sm leading-relaxed" style={{ color: color.inkMuted }}>
                  {useCase}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
