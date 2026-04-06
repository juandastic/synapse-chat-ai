import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { cn } from "@/lib/utils";

interface MemoryPulseProps {
  className?: string;
}

/**
 * Displays live memory stats from the user's knowledge graph.
 * Prominent indicator on the home screen communicating Synapse's memory.
 * Reactive — auto-updates when user_memory changes (e.g., after hydration).
 */
export function MemoryPulse({ className }: MemoryPulseProps) {
  const stats = useQuery(api.userMemory.get);
  const { t } = useTranslation("chat");

  // Loading state
  if (stats === undefined) {
    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/30" />
          <span className="text-sm text-muted-foreground/50">
            {t("memoryPulse.loading")}
          </span>
        </div>
      </div>
    );
  }

  // No stats yet (new user or hasn't had a hydration)
  if (!stats || (stats.entityCount === 0 && stats.relationshipCount === 0)) {
    return (
      <p className={cn("text-xs text-muted-foreground/50", className)}>
        {t("memoryPulse.building")}
      </p>
    );
  }

  const totalMemories = stats.entityCount + stats.relationshipCount;
  const formattedTokens = stats.totalTokens >= 1000
    ? `~${Math.round(stats.totalTokens / 1000)}K`
    : `${stats.totalTokens}`;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {/* Stats line */}
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500/70" />
        <span className="text-sm text-muted-foreground">
          {totalMemories.toLocaleString()} {t("memoryPulse.memories")}
          {stats.totalTokens > 0 && (
            <span className="text-muted-foreground/60">
              {" · "}{formattedTokens} tokens
            </span>
          )}
        </span>
      </div>

      {/* Description */}
      <p className="max-w-xs text-center text-xs text-muted-foreground/50">
        {t("memoryPulse.description", {
          count: totalMemories.toLocaleString(),
        })}
      </p>
    </div>
  );
}
