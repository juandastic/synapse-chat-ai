import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Loader2, Clock, AlertCircle, RefreshCw } from "lucide-react";

/**
 * Real-time status indicator for active Cortex processing jobs.
 *
 * Subscribes to the user's non-completed jobs and renders:
 * - Pending/Processing: spinner with "Updating memory graph..."
 * - Polling (has nextRetryAt, no lastError): clock icon with "next check in ~Xm"
 * - Retrying (has nextRetryAt + lastError): clock icon with "Retrying in ~Xm"
 * - Failed: error icon with manual retry button
 *
 * Placed below the Memory Explorer header.
 */
export function CortexJobStatus() {
  const jobs = useQuery(api.cortexJobs.getActiveByUser);
  const retryJob = useMutation(api.cortexJobs.retryJob);

  // Don't render anything while loading or if no active jobs
  if (jobs === undefined || jobs.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border/50 bg-card/50 px-4 py-2 space-y-1.5">
      {jobs.map((job) => (
        <JobStatusRow
          key={job._id}
          status={job.status}
          type={job.type}
          attempts={job.attempts}
          maxAttempts={job.maxAttempts}
          lastError={job.lastError}
          nextRetryAt={job.nextRetryAt}
          onRetry={() => retryJob({ jobId: job._id })}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface JobStatusRowProps {
  status: string;
  type: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  nextRetryAt?: number;
  onRetry: () => void;
}

function JobStatusRow({
  status,
  type,
  attempts,
  maxAttempts,
  lastError,
  nextRetryAt,
  onRetry,
}: JobStatusRowProps) {
  const label = type === "ingest" ? "memory graph" : "memory correction";
  const isRetrying =
    status === "processing" && nextRetryAt && nextRetryAt > Date.now();

  // Failed state
  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="text-destructive">
          Failed to update {label}.
          {lastError && (
            <span className="text-destructive/70"> ({lastError.slice(0, 60)})</span>
          )}
        </span>
        <button
          onClick={onRetry}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-md px-2 py-0.5",
            "text-xs font-medium text-primary",
            "hover:bg-primary/10 transition-colors"
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  // Polling or retrying with countdown (nextRetryAt set)
  if (isRetrying) {
    const minutesLeft = Math.max(
      1,
      Math.ceil((nextRetryAt - Date.now()) / 60_000)
    );
    const isActualRetry = !!lastError;
    return (
      <div className="flex items-center gap-2 text-xs">
        <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="text-muted-foreground">
          {isActualRetry
            ? `AI overloaded. Retrying ${label} in ~${minutesLeft}m...`
            : `Processing ${label}... next check in ~${minutesLeft}m`}
          {isActualRetry && (
            <span className="text-muted-foreground/50">
              {" "}
              (attempt {attempts}/{maxAttempts})
            </span>
          )}
        </span>
      </div>
    );
  }

  // Pending or actively processing
  return (
    <div className="flex items-center gap-2 text-xs">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <span className="text-muted-foreground">
        Updating {label}...
        {attempts > 0 && (
          <span className="text-muted-foreground/50">
            {" "}
            (attempt {attempts + 1}/{maxAttempts})
          </span>
        )}
      </span>
    </div>
  );
}
