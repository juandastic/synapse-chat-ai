import { useTransition, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * Hardcoded system templates (mirrors convex/personas.ts PERSONA_TEMPLATES).
 * Used for display -- actual creation goes through the backend.
 */
const SYSTEM_TEMPLATES = [
  {
    key: "therapist",
    name: "Therapist",
    icon: "🧠",
    description: "ACT/DBT therapist with expertise in neurodivergent support",
  },
  {
    key: "coach",
    name: "Coach",
    icon: "🎯",
    description: "Life and productivity coach for goals and growth",
  },
  {
    key: "friend",
    name: "Friend",
    icon: "💬",
    description: "Casual supportive companion for everyday conversations",
  },
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
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 p-4">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <path
                d="M30 50 Q50 25 70 50 Q50 75 30 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                className="text-primary/70"
              />
              <circle cx="50" cy="50" r="8" className="fill-primary/70" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Start a new conversation
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            Choose a persona to begin. Each brings a unique perspective and
            communication style.
          </p>
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
                Templates
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          </>
        )}

        {/* System templates */}
        {personas !== undefined && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEM_TEMPLATES.map((template) => (
              <PersonaCard
                key={template.key}
                icon={template.icon}
                name={template.name}
                description={template.description}
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
            <span>Creating your conversation...</span>
          </div>
        )}
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
      <span
        className="mb-3 text-4xl transition-transform group-hover:scale-110"
        role="img"
        aria-hidden="true"
      >
        {icon}
      </span>
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
