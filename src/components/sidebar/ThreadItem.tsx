import { memo } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ThreadItemProps {
  threadId: string;
  title: string;
  personaIcon: string;
  lastMessageAt: number;
}

/**
 * Memoized thread list item for the sidebar.
 * Shows persona icon, truncated title, and relative timestamp.
 */
export const ThreadItem = memo(function ThreadItem({
  threadId,
  title,
  personaIcon,
  lastMessageAt,
}: ThreadItemProps) {
  const relativeTime = getRelativeTime(lastMessageAt);

  return (
    <NavLink
      to={`/t/${threadId}`}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
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
  );
});

/**
 * Simple relative time formatter.
 * Returns "just now", "Xm ago", "Xh ago", "Xd ago", etc.
 */
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}
