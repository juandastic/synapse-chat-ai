import { useTransition, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { cn } from "@/lib/utils";
import { Logo } from "../ui/logo";
import { PersonaIcon } from "@/components/ui/PersonaIcon";
import { MemoryPulse } from "./MemoryPulse";

/**
 * System templates shown based on UI language.
 * Mirrors convex/personas.ts PERSONA_TEMPLATES keys.
 */
const TEMPLATES_EN = [
  { key: "therapist-en", icon: "compass", nameKey: "templates.therapist.name", descKey: "templates.therapist.description" },
  { key: "wellbeing-en", icon: "leaf", nameKey: "templates.wellbeing.name", descKey: "templates.wellbeing.description" },
  { key: "coach-en", icon: "zap", nameKey: "templates.coach.name", descKey: "templates.coach.description" },
] as const;

const TEMPLATES_ES = [
  { key: "therapist-es", icon: "compass", nameKey: "templates.therapist.name", descKey: "templates.therapist.description" },
  { key: "wellbeing-es", icon: "leaf", nameKey: "templates.wellbeing.name", descKey: "templates.wellbeing.description" },
  { key: "coach-es", icon: "zap", nameKey: "templates.coach.name", descKey: "templates.coach.description" },
] as const;

/**
 * Inline persona selector view rendered in the content area when route is "/".
 * Replaces the "New Chat Modal" for a smoother UX.
 *
 * - Shows user's custom personas first
 * - Shows system templates under a divider
 * - On click: creates persona (if template), creates thread, navigates to chat
 */
export function PersonaSelector() {
  const navigate = useNavigate();
  const personas = useQuery(api.personas.list);
  const createFromTemplate = useMutation(api.personas.createFromTemplate);
  const createThread = useMutation(api.threads.create);
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation("chat");
  const { t: tl, i18n } = useTranslation("landing");
  const systemTemplates = i18n.language === "es" ? TEMPLATES_ES : TEMPLATES_EN;

  const handleSelectPersona = useCallback(
    (personaId: Id<"personas">) => {
      startTransition(async () => {
        const threadId = await createThread({ personaId });
        navigate(`/t/${threadId}`);
      });
    },
    [createThread, navigate]
  );

  const handleSelectTemplate = useCallback(
    (templateKey: string) => {
      startTransition(async () => {
        const personaId = await createFromTemplate({ templateKey });
        const threadId = await createThread({ personaId });
        navigate(`/t/${threadId}`);
      });
    },
    [createFromTemplate, createThread, navigate]
  );

  const hasCustomPersonas = personas && personas.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 p-4">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {t("personaSelector.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            {t("personaSelector.subtitle")}
          </p>
          <MemoryPulse className="mt-4" />
        </div>

        {/* Loading state */}
        {personas === undefined && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl bg-muted/50"
              />
            ))}
          </div>
        )}

        {/* Custom personas */}
        {hasCustomPersonas && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {personas.map((persona) => (
                <PersonaCard
                  key={persona._id}
                  icon={persona.icon}
                  name={persona.name}
                  description={persona.description}
                  disabled={isPending}
                  onClick={() => handleSelectPersona(persona._id)}
                />
              ))}
            </div>

            {/* Templates divider */}
            <div className="my-8 flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
                {t("personaSelector.templates")}
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          </>
        )}

        {/* System templates */}
        {personas !== undefined && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemTemplates.map((template) => (
              <PersonaCard
                key={template.key}
                icon={template.icon}
                name={tl(template.nameKey)}
                description={tl(template.descKey)}
                disabled={isPending}
                onClick={() => handleSelectTemplate(template.key)}
                isTemplate
              />
            ))}
          </div>
        )}

        {/* Pending indicator */}
        {isPending && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{t("personaSelector.creating")}</span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// =============================================================================
// PersonaCard
// =============================================================================

interface PersonaCardProps {
  icon: string;
  name: string;
  description?: string;
  disabled: boolean;
  onClick: () => void;
  isTemplate?: boolean;
}

function PersonaCard({
  icon,
  name,
  description,
  disabled,
  onClick,
  isTemplate,
}: PersonaCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex flex-col items-center rounded-2xl border border-border/50 bg-card p-6 text-center shadow-sm transition-all",
        "hover:border-primary/20 hover:shadow-md hover:scale-[1.02]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        isTemplate && "border-dashed"
      )}
    >
      <div className="mb-3 transition-transform group-hover:scale-110">
        <PersonaIcon icon={icon} size="lg" />
      </div>
      <h3 className="font-display text-sm font-semibold text-foreground">
        {name}
      </h3>
      {description && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      )}
    </button>
  );
}
