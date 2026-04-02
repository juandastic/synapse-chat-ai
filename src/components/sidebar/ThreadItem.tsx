import { memo } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface ThreadItemProps {
  threadId: string;
  title: string;
  personaIcon: string;
  lastMessageAt: number;
  /** Called when the user clicks the delete button */
  onDelete: (threadId: string, title: string) => void;
  /** Hide the delete button (e.g. for demo accounts) */
  hideDelete?: boolean;
}

/**
 * Memoized thread list item for the sidebar.
 * Shows persona icon, truncated title, relative timestamp, and a delete button on hover.
 */
export const ThreadItem = memo(function ThreadItem({
  threadId,
  title,
  personaIcon,
  lastMessageAt,
  onDelete,
  hideDelete,
}: ThreadItemProps) {
  const { t } = useTranslation("sidebar");
  const relativeTime = getRelativeTime(lastMessageAt, t);

  return (
    <div className="group relative">
      <NavLink
        to={`/t/${threadId}`}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 pr-9 text-sm transition-all",
            isActive
              ? "border-l-2 border-primary bg-primary/10 text-foreground"
              : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )
        }
      >
        <span className="shrink-0 text-lg" role="img" aria-hidden="true">
          {personaIcon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-snug">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {relativeTime}
          </p>
        </div>
      </NavLink>

      {/* Delete button — visible on hover, hidden for demo users */}
      {!hideDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(threadId, title);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/0 transition-all group-hover:text-muted-foreground hover:!bg-destructive/10 hover:!text-destructive"
          aria-label={t("deleteAriaLabel", { title })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

/**
 * Simple relative time formatter.
 * Returns translated "just now", "Xm ago", "Xh ago", "Xd ago", etc.
 */
function getRelativeTime(timestamp: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return t("time.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("time.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return t("time.daysAgo", { count: diffDay });
  const diffMonth = Math.floor(diffDay / 30);
  return t("time.monthsAgo", { count: diffMonth });
}
