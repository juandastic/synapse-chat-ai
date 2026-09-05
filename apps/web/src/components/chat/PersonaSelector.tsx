import { useTransition, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { cn, getRelativeTime } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
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
 *
 * Shows a unified grid mixing custom personas and un-adopted system templates.
 * On click: creates persona (if template), creates thread, navigates to chat.
 */
export function PersonaSelector() {
  const navigate = useNavigate();
  const { user } = useUser();
  const personas = useQuery(api.personas.list);
  // Reuse threads.list (already subscribed by Sidebar) — no extra query cost.
  // Derive top 3 in JS with frontend persona join.
  const rawThreads = useQuery(api.threads.list);
  const recentThreads = useMemo(() => {
    if (!rawThreads || rawThreads.length === 0) return null;
    const personaMap = new Map(
      (personas ?? []).map((p) => [p._id, { name: p.name, icon: p.icon }])
    );
    return rawThreads.slice(0, 3).map((thread) => ({
      ...thread,
      persona: personaMap.get(thread.personaId) ?? { name: "Unknown", icon: "❓" },
    }));
  }, [rawThreads, personas]);
  const createFromTemplate = useMutation(api.personas.createFromTemplate);
  const createThread = useMutation(api.threads.create);
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation("chat");
  const { t: tl, i18n } = useTranslation("landing");
  const allTemplates = i18n.language === "es" ? TEMPLATES_ES : TEMPLATES_EN;

  // Build a unified list: custom personas + un-adopted templates (same visual)
  type GridItem =
    | { kind: "persona"; id: string; icon: string; name: string; description?: string }
    | { kind: "template"; key: string; icon: string; name: string; description: string };

  const gridItems = useMemo<GridItem[]>(() => {
    if (!personas) return [];

    const items: GridItem[] = personas.map((p) => ({
      kind: "persona" as const,
      id: p._id,
      icon: p.icon,
      name: p.name,
      description: p.description,
    }));

    // Append un-adopted templates (suppress those whose name matches an existing persona)
    const personaNames = new Set(personas.map((p) => p.name.toLowerCase()));
    for (const tmpl of allTemplates) {
      const name = tl(tmpl.nameKey);
      if (!personaNames.has(name.toLowerCase())) {
        items.push({
          kind: "template" as const,
          key: tmpl.key,
          icon: tmpl.icon,
          name,
          description: tl(tmpl.descKey),
        });
      }
    }

    return items;
  }, [personas, allTemplates, tl]);

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

  const hasRecentThreads = recentThreads && recentThreads.length > 0;

  // Context-aware greeting and subtitle
  const greeting = hasRecentThreads
    ? (user?.firstName
        ? t("personaSelector.greetingWithName", { name: user.firstName })
        : t("personaSelector.greetingReturning"))
    : t("personaSelector.greetingNew");

  const subtitle = hasRecentThreads
    ? t("personaSelector.subtitleReturning")
    : t("personaSelector.subtitleNew");

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
            {greeting}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            {subtitle}
          </p>
        </div>

        {/* Recent conversations */}
        {hasRecentThreads && (
          <RecentThreads
            threads={recentThreads}
            t={t}
            onNavigate={(threadId) => navigate(`/t/${threadId}`)}
          />
        )}

        {/* Section label for persona grid (returning users only) */}
        {hasRecentThreads && gridItems.length > 0 && (
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("personaSelector.newConversation")}
          </h2>
        )}

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

        {/* Unified personas grid (custom + un-adopted templates) */}
        {gridItems.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridItems.map((item) => (
              <PersonaCard
                key={item.kind === "persona" ? item.id : item.key}
                icon={item.icon}
                name={item.name}
                description={item.description}
                disabled={isPending}
                onClick={
                  item.kind === "persona"
                    ? () => handleSelectPersona(item.id as Id<"personas">)
                    : () => handleSelectTemplate(item.key)
                }
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

        {/* Memory pulse — quiet footer */}
        <MemoryPulse className="mt-10" />
      </div>
      </div>
    </div>
  );
}

// =============================================================================
// RecentThreads — "Continue where you left off"
// =============================================================================

interface RecentThread {
  _id: string;
  title: string;
  lastMessageAt: number;
  persona: { name: string; icon: string };
}

function RecentThreads({
  threads,
  t,
  onNavigate,
}: {
  threads: RecentThread[];
  t: (key: string) => string;
  onNavigate: (threadId: string) => void;
}) {
  const { t: ts } = useTranslation("sidebar");

  return (
    <div className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t("personaSelector.recentThreads")}
        </h2>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("toggle-sidebar"));
          }}
          className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("personaSelector.viewAll")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {threads.map((thread) => (
          <button
            key={thread._id}
            onClick={() => onNavigate(thread._id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 text-left shadow-sm transition-all",
              "hover:border-primary/20 hover:shadow-md hover:scale-[1.01]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "active:scale-[0.98]"
            )}
          >
            <PersonaIcon
              icon={thread.persona.icon}
              size="sm"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {thread.title}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                {getRelativeTime(thread.lastMessageAt, ts)}
              </p>
            </div>
          </button>
        ))}
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
}

function PersonaCard({
  icon,
  name,
  description,
  disabled,
  onClick,
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
        "disabled:pointer-events-none disabled:opacity-50"
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
