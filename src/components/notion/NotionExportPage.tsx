import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Circle,
  AlertCircle,
  ExternalLink,
  Database,
  Sparkles,
  Network,
  LayoutGrid,
} from "lucide-react";

// =============================================================================
// Constants
// =============================================================================

const LANGUAGE_OPTIONS = ["English", "Español"];

const PIPELINE_STEPS = [
  { key: "hydrating", label: "Reading your memory graph" },
  { key: "analyzing", label: "Designing database schemas" },
  { key: "extracting_entries", label: "Extracting entries" },
  { key: "creating_databases", label: "Creating Notion databases" },
  { key: "populating", label: "Populating databases" },
  { key: "summarizing", label: "Creating summary page" },
  { key: "done", label: "Done" },
];

type Phase = "config" | "exporting" | "completed" | "failed";

// =============================================================================
// Page
// =============================================================================

export function NotionExportPage() {
  const navigate = useNavigate();
  const savedConfig = useQuery(api.notionConfig.getNotionConfig);
  const saveConfig = useMutation(api.notionConfig.saveNotionConfig);
  const startExport = useAction(api.notion.startExport);
  const getStatus = useAction(api.notion.getExportStatus);

  // Form state
  const [notionToken, setNotionToken] = useState("");
  const [notionPageName, setNotionPageName] = useState("");
  const [notionLanguage, setNotionLanguage] = useState("English");

  // Export lifecycle
  const [phase, setPhase] = useState<Phase>("config");
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [categoriesDesigned, setCategoriesDesigned] = useState<number | null>(null);
  const [entriesExtracted, setEntriesExtracted] = useState<number | null>(null);
  const [result, setResult] = useState<{
    summaryPageUrl: string;
    categoriesCount: number;
    entriesCount: number;
    durationMs: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fill form from saved config
  useEffect(() => {
    if (savedConfig) {
      if (savedConfig.notionToken) setNotionToken(savedConfig.notionToken);
      if (savedConfig.notionPageName) setNotionPageName(savedConfig.notionPageName);
      if (savedConfig.notionLanguage) setNotionLanguage(savedConfig.notionLanguage);
    }
  }, [savedConfig]);

  // Polling
  useEffect(() => {
    if (phase !== "exporting" || !jobId) return;

    const poll = async () => {
      try {
        const status = await getStatus({ jobId });

        if (status.progress?.currentStep) {
          setCurrentStep(status.progress.currentStep);
        }
        if (status.progress?.categoriesDesigned != null) {
          setCategoriesDesigned(status.progress.categoriesDesigned);
        }
        if (status.progress?.entriesExtracted != null) {
          setEntriesExtracted(status.progress.entriesExtracted);
        }

        if (status.status === "completed" && status.result) {
          if (pollRef.current) clearInterval(pollRef.current);
          setResult({
            summaryPageUrl: status.result.summaryPageUrl,
            categoriesCount: status.result.categoriesCount,
            entriesCount: status.result.entriesCount,
            durationMs: status.result.durationMs,
          });
          setPhase("completed");
        } else if (status.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage(
            status.error
              ? status.code
                ? `${status.error} (${status.code})`
                : status.error
              : "Export failed"
          );
          setPhase("failed");
        }
      } catch (err) {
        // 404 means the job was already consumed after a terminal response —
        // stop polling immediately instead of retrying.
        if (err instanceof Error && err.message.includes("Export job not found")) {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage("Export result expired. Please start a new export.");
          setPhase("failed");
          return;
        }
        console.warn("[NotionExport] Poll error", err);
      }
    };

    pollRef.current = setInterval(poll, 30000);
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, jobId, getStatus]);

  useEffect(() => {
    if (phase !== "exporting" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const token = notionToken.trim();
      const page = notionPageName.trim();

      if (!token) {
        setSubmitError("Notion integration token is required");
        return;
      }
      if (!page) {
        setSubmitError("Parent page name is required");
        return;
      }

      setIsSubmitting(true);
      try {
        // Save config so fields pre-fill next time
        await saveConfig({
          notionToken: token,
          notionPageName: page,
          notionLanguage,
        });
        const response = await startExport({
          notionToken: token,
          notionPageName: page,
          notionLanguage,
        });
        setJobId(response.jobId);
        setPhase("exporting");
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to start export");
      } finally {
        setIsSubmitting(false);
      }
    },
    [notionToken, notionPageName, notionLanguage, saveConfig, startExport]
  );

  const handleReset = useCallback(() => {
    setPhase("config");
    setJobId(null);
    setCurrentStep(null);
    setCategoriesDesigned(null);
    setEntriesExtracted(null);
    setResult(null);
    setErrorMessage(null);
    setSubmitError(null);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-sm font-semibold tracking-tight text-foreground">
          Notion Export
        </h1>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-8 space-y-8">

          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15">
              <Database className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Export Your Memory to Notion
              </h2>
              <p className="mt-2 text-sm text-muted-foreground text-balance leading-relaxed">
                Synapse will read your entire knowledge graph and transform it into
                structured, browsable Notion databases — one per category — all
                organized under a single parent page you choose.
              </p>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FeatureCard
              icon={<Network className="h-4 w-4 text-primary" />}
              title="Full graph read"
              description="Every entity, relationship, and insight stored in your memory"
            />
            <FeatureCard
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="AI-designed schemas"
              description="Gemini designs custom database columns tailored to your data"
            />
            <FeatureCard
              icon={<LayoutGrid className="h-4 w-4 text-primary" />}
              title="Structured databases"
              description="People, projects, health, goals — each in its own Notion database"
            />
          </div>

          {/* Main card */}
          <div className="rounded-2xl border border-border/50 bg-card shadow-sm">
            {phase === "config" && (
              <ConfigSection
                notionToken={notionToken}
                notionPageName={notionPageName}
                notionLanguage={notionLanguage}
                onTokenChange={setNotionToken}
                onPageNameChange={setNotionPageName}
                onLanguageChange={setNotionLanguage}
                onSubmit={handleSubmit}
                error={submitError}
                isSubmitting={isSubmitting}
              />
            )}

            {phase === "exporting" && (
              <ExportingSection
                currentStep={currentStep}
                categoriesDesigned={categoriesDesigned}
                entriesExtracted={entriesExtracted}
              />
            )}

            {phase === "completed" && result && (
              <CompletedSection result={result} onReset={handleReset} />
            )}

            {phase === "failed" && (
              <FailedSection error={errorMessage} onReset={handleReset} />
            )}
          </div>

          {/* Setup instructions */}
          {phase === "config" && (
            <details className="group rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
              <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground list-none flex items-center justify-between">
                <span>How to set up your Notion integration</span>
                <span className="text-muted-foreground/50 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
                <li>Go to <strong className="text-foreground/70">notion.so/profile/integrations</strong> and create a new internal integration</li>
                <li>Copy the integration secret (starts with <code className="font-mono text-foreground/70">ntn_</code>)</li>
                <li>Create or open a parent page in Notion (e.g. "Synapse")</li>
                <li>Open the page menu → <strong className="text-foreground/70">Connect to</strong> → select your integration</li>
                <li>Use that page name in the field below</li>
              </ol>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Feature card
// =============================================================================

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// =============================================================================
// Config section
// =============================================================================

interface ConfigSectionProps {
  notionToken: string;
  notionPageName: string;
  notionLanguage: string;
  onTokenChange: (v: string) => void;
  onPageNameChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onSubmit: (e: React.SyntheticEvent) => void;
  error: string | null;
  isSubmitting: boolean;
}

function ConfigSection({
  notionToken,
  notionPageName,
  notionLanguage,
  onTokenChange,
  onPageNameChange,
  onLanguageChange,
  onSubmit,
  error,
  isSubmitting,
}: ConfigSectionProps) {
  return (
    <form onSubmit={onSubmit} className="divide-y divide-border/40">
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your credentials are saved and pre-filled for future exports.
        </p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="notion-token"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Integration Token
          </label>
          <input
            id="notion-token"
            type="password"
            value={notionToken}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="ntn_..."
            className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 font-mono text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="notion-page"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Parent Page Name
            </label>
            <input
              id="notion-page"
              type="text"
              value={notionPageName}
              onChange={(e) => onPageNameChange(e.target.value)}
              placeholder="e.g. Synapse"
              className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label
              htmlFor="notion-language"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Output Language
            </label>
            <select
              id="notion-language"
              value={notionLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all",
            "hover:bg-primary/90 active:scale-[0.98]",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting export…
            </>
          ) : (
            <>
              <Database className="h-4 w-4" />
              Export to Notion
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Exporting section
// =============================================================================

interface ExportingSectionProps {
  currentStep: string | null;
  categoriesDesigned: number | null;
  entriesExtracted: number | null;
}

function ExportingSection({ currentStep, categoriesDesigned, entriesExtracted }: ExportingSectionProps) {
  const currentIdx = currentStep
    ? PIPELINE_STEPS.findIndex((s) => s.key === currentStep)
    : -1;

  return (
    <div className="divide-y divide-border/40">
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Exporting…</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This can take a few minutes. You can leave this page and come back.
        </p>
      </div>

      <div className="px-5 py-5 space-y-3">
        {PIPELINE_STEPS.filter((s) => s.key !== "done").map((step, idx) => {
          const isDone = currentIdx > idx;
          const isActive = currentIdx === idx;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/25" />
                )}
              </div>
              <span
                className={cn(
                  "text-sm",
                  isDone && "text-muted-foreground/50",
                  isActive && "font-medium text-foreground",
                  !isDone && !isActive && "text-muted-foreground/35"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {(categoriesDesigned != null || entriesExtracted != null) && (
        <div className="px-5 py-3 flex gap-6">
          {categoriesDesigned != null && (
            <Stat label="Categories" value={categoriesDesigned} />
          )}
          {entriesExtracted != null && (
            <Stat label="Entries" value={entriesExtracted} />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// =============================================================================
// Completed section
// =============================================================================

interface CompletedSectionProps {
  result: {
    summaryPageUrl: string;
    categoriesCount: number;
    entriesCount: number;
    durationMs: number;
  };
  onReset: () => void;
}

function CompletedSection({ result, onReset }: CompletedSectionProps) {
  const minutes = Math.round(result.durationMs / 60_000);

  return (
    <div className="divide-y divide-border/40">
      <div className="px-5 py-5 flex flex-col items-center text-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Export complete</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.categoriesCount} database{result.categoriesCount !== 1 ? "s" : ""} ·{" "}
            {result.entriesCount} entries · {minutes > 0 ? `${minutes}m` : "<1m"}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-2">
        <a
          href={result.summaryPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all",
            "hover:bg-primary/90 active:scale-[0.98]"
          )}
        >
          Open in Notion
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={onReset}
          className="w-full rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          New Export
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Failed section
// =============================================================================

interface FailedSectionProps {
  error: string | null;
  onReset: () => void;
}

function FailedSection({ error, onReset }: FailedSectionProps) {
  return (
    <div className="divide-y divide-border/40">
      <div className="px-5 py-5 flex flex-col items-center text-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Export failed</h3>
          {error && (
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <button
          onClick={onReset}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all",
            "hover:bg-primary/90 active:scale-[0.98]"
          )}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
