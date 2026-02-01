import { memo } from "react";
import { formatSessionDate } from "@/lib/utils";

interface SessionDividerProps {
  timestamp: number;
}

export const SessionDivider = memo(function SessionDivider({
  timestamp,
}: SessionDividerProps) {
  return (
    <div className="flex items-center gap-4 py-6">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <svg
          className="h-3.5 w-3.5 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="font-medium">{formatSessionDate(timestamp)}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
    </div>
  );
});
