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
  RefreshCw,
} from "lucide-react";

// =============================================================================
// Constants
// =============================================================================

const LANGUAGE_OPTIONS = ["English", "Español"];

const STORAGE_KEY_EXPORT = "synapse:notion:exportJobId";
const STORAGE_KEY_CORRECTIONS = "synapse:notion:correctionsJobId";

const EXPORT_STEPS = [
  { key: "hydrating", label: "Reading your memory graph" },
  { key: "analyzing", label: "Designing database schemas" },
  { key: "extracting_entries", label: "Extracting entries" },
  { key: "creating_databases", label: "Creating Notion databases" },
  { key: "populating", label: "Populating databases" },
  { key: "summarizing", label: "Creating summary page" },
  { key: "done", label: "Done" },
];

const CORRECTION_STEPS = [
  { key: "scanning", label: "Scanning Notion databases" },
  { key: "applying", label: "Applying corrections to graph" },
  { key: "done", label: "Done" },
];

type Phase =
  | "config"
  | "exporting"
  | "completed"
  | "failed"
  | "correcting"
  | "corrections-completed"
  | "corrections-failed";

// =============================================================================
// Shared types
// =============================================================================

interface ExportResult {
  summaryPageUrl: string;
  categoriesCount: number;
  entriesCount: number;
  durationMs: number;
}

interface CorrectionsResult {
  correctionsFound: number;
  correctionsApplied: number;
  correctionsFailed: number;
  failedCorrections: Array<{ category: string; title: string; error: string }>;
  durationMs: number;
}

// =============================================================================
// Page
// =============================================================================

export function NotionExportPage() {
  const navigate = useNavigate();
  const savedConfig = useQuery(api.notionConfig.getNotionConfig);
  const saveConfig = useMutation(api.notionConfig.saveNotionConfig);
  const startExportAction = useAction(api.notion.startExport);
  const getExportStatus = useAction(api.notion.getExportStatus);
  const startCorrectionsAction = useAction(api.notion.startCorrections);
  const getCorrectionsStatus = useAction(api.notion.getCorrectionsStatus);

  // ── Form fields ────────────────────────────────────────────────────────────
  const [notionToken, setNotionToken] = useState("");
  const [notionPageName, setNotionPageName] = useState("");
  const [notionLanguage, setNotionLanguage] = useState("English");

  // ── Shared lifecycle ───────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("config");
  const [restoring, setRestoring] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Export-specific state ──────────────────────────────────────────────────
  const [isSubmittingExport, setIsSubmittingExport] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportCurrentStep, setExportCurrentStep] = useState<string | null>(null);
  const [exportCategoriesDesigned, setExportCategoriesDesigned] = useState<number | null>(null);
  const [exportEntriesExtracted, setExportEntriesExtracted] = useState<number | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // ── Corrections-specific state ─────────────────────────────────────────────
  const [isSubmittingCorrections, setIsSubmittingCorrections] = useState(false);
  const [correctionsJobId, setCorrectionsJobId] = useState<string | null>(null);
  const [correctionsCurrentStep, setCorrectionsCurrentStep] = useState<string | null>(null);
  const [correctionsDatabasesScanned, setCorrectionsDatabasesScanned] = useState<number | null>(null);
  const [correctionsFound, setCorrectionsFound] = useState<number | null>(null);
  const [correctionsApplied, setCorrectionsApplied] = useState<number | null>(null);
  const [correctionsFailed, setCorrectionsFailed] = useState<number | null>(null);
  const [correctionsResult, setCorrectionsResult] = useState<CorrectionsResult | null>(null);

  // ── Pre-fill form from saved config ───────────────────────────────────────
  useEffect(() => {
    if (!savedConfig) return;
    if (savedConfig.notionToken) setNotionToken(savedConfig.notionToken);
    if (savedConfig.notionPageName) setNotionPageName(savedConfig.notionPageName);
    if (savedConfig.notionLanguage) setNotionLanguage(savedConfig.notionLanguage);
  }, [savedConfig]);

  // ── Restore in-flight job from localStorage on mount ──────────────────────
  useEffect(() => {
    const storedExportId = localStorage.getItem(STORAGE_KEY_EXPORT);
    const storedCorrectionsId = localStorage.getItem(STORAGE_KEY_CORRECTIONS);

    if (!storedExportId && !storedCorrectionsId) {
      setRestoring(false);
      return;
    }

    const restore = async () => {
      if (storedExportId) {
        try {
          const status = await getExportStatus({ jobId: storedExportId });
          if (status.status === "processing") {
            if (status.progress?.currentStep) setExportCurrentStep(status.progress.currentStep);
            if (status.progress?.categoriesDesigned != null) setExportCategoriesDesigned(status.progress.categoriesDesigned);
            if (status.progress?.entriesExtracted != null) setExportEntriesExtracted(status.progress.entriesExtracted);
            setExportJobId(storedExportId);
            setPhase("exporting");
          } else if (status.status === "completed" && status.result) {
            setExportResult(status.result);
            setPhase("completed");
            localStorage.removeItem(STORAGE_KEY_EXPORT);
          } else if (status.status === "failed") {
            setTerminalError(formatJobError(status.error, status.code, "Export failed"));
            setPhase("failed");
            localStorage.removeItem(STORAGE_KEY_EXPORT);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY_EXPORT);
        }
      } else if (storedCorrectionsId) {
        try {
          const status = await getCorrectionsStatus({ jobId: storedCorrectionsId });
          if (status.status === "processing") {
            if (status.progress?.currentStep) setCorrectionsCurrentStep(status.progress.currentStep);
            if (status.progress?.databasesScanned != null) setCorrectionsDatabasesScanned(status.progress.databasesScanned);
            if (status.progress?.correctionsFound != null) setCorrectionsFound(status.progress.correctionsFound);
            if (status.progress?.correctionsApplied != null) setCorrectionsApplied(status.progress.correctionsApplied);
            if (status.progress?.correctionsFailed != null) setCorrectionsFailed(status.progress.correctionsFailed);
            setCorrectionsJobId(storedCorrectionsId);
            setPhase("correcting");
          } else if (status.status === "completed" && status.result) {
            setCorrectionsResult(status.result);
            setPhase("corrections-completed");
            localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
          } else if (status.status === "failed") {
            setTerminalError(formatJobError(status.error, status.code, "Corrections failed"));
            setPhase("corrections-failed");
            localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
        }
      }
      setRestoring(false);
    };

    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once; action hooks are stable Convex references

  // ── Stop polling whenever phase leaves an active state ────────────────────
  useEffect(() => {
    if (phase !== "exporting" && phase !== "correcting" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  // ── Export polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exporting" || !exportJobId) return;

    const poll = async () => {
      try {
        const status = await getExportStatus({ jobId: exportJobId });

        if (status.progress?.currentStep) {
          setExportCurrentStep(status.progress.currentStep);
        }
        if (status.progress?.categoriesDesigned != null) {
          setExportCategoriesDesigned(status.progress.categoriesDesigned);
        }
        if (status.progress?.entriesExtracted != null) {
          setExportEntriesExtracted(status.progress.entriesExtracted);
        }

        if (status.status === "completed" && status.result) {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_EXPORT);
          setExportResult(status.result);
          setPhase("completed");
        } else if (status.status === "failed") {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_EXPORT);
          setTerminalError(formatJobError(status.error, status.code, "Export failed"));
          setPhase("failed");
        }
      } catch (err) {
        if (isJobExpiredError(err)) {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_EXPORT);
          setTerminalError("Export result expired. Please start a new export.");
          setPhase("failed");
          return;
        }
        console.warn("[NotionExport] Export poll error", err);
      }
    };

    pollRef.current = setInterval(poll, 30_000);
    poll();
    return () => clearInterval(pollRef.current!);
  }, [phase, exportJobId, getExportStatus]);

  // ── Corrections polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "correcting" || !correctionsJobId) return;

    const poll = async () => {
      try {
        const status = await getCorrectionsStatus({ jobId: correctionsJobId });

        if (status.progress?.currentStep) {
          setCorrectionsCurrentStep(status.progress.currentStep);
        }
        if (status.progress?.databasesScanned != null) {
          setCorrectionsDatabasesScanned(status.progress.databasesScanned);
        }
        if (status.progress?.correctionsFound != null) {
          setCorrectionsFound(status.progress.correctionsFound);
        }
        if (status.progress?.correctionsApplied != null) {
          setCorrectionsApplied(status.progress.correctionsApplied);
        }
        if (status.progress?.correctionsFailed != null) {
          setCorrectionsFailed(status.progress.correctionsFailed);
        }

        if (status.status === "completed" && status.result) {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
          setCorrectionsResult(status.result);
          setPhase("corrections-completed");
        } else if (status.status === "failed") {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
          setTerminalError(formatJobError(status.error, status.code, "Corrections failed"));
          setPhase("corrections-failed");
        }
      } catch (err) {
        if (isJobExpiredError(err)) {
          clearInterval(pollRef.current!);
          localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
          setTerminalError("Corrections job expired. Please try again.");
          setPhase("corrections-failed");
          return;
        }
        console.warn("[NotionExport] Corrections poll error", err);
      }
    };

    pollRef.current = setInterval(poll, 30_000);
    poll();
    return () => clearInterval(pollRef.current!);
  }, [phase, correctionsJobId, getCorrectionsStatus]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const validateForm = (): { token: string; page: string } | null => {
    const token = notionToken.trim();
    const page = notionPageName.trim();
    if (!token) {
      setSubmitError("Notion integration token is required");
      return null;
    }
    if (!page) {
      setSubmitError("Parent page name is required");
      return null;
    }
    return { token, page };
  };

  const handleExport = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const fields = validateForm();
      if (!fields) return;

      setIsSubmittingExport(true);
      try {
        await saveConfig({
          notionToken: fields.token,
          notionPageName: fields.page,
          notionLanguage,
        });
        const response = await startExportAction({
          notionToken: fields.token,
          notionPageName: fields.page,
          notionLanguage,
        });
        localStorage.setItem(STORAGE_KEY_EXPORT, response.jobId);
        setExportJobId(response.jobId);
        setPhase("exporting");
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to start export");
      } finally {
        setIsSubmittingExport(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notionToken, notionPageName, notionLanguage, saveConfig, startExportAction]
  );

  const handleStartCorrections = useCallback(async () => {
    setSubmitError(null);

    const fields = validateForm();
    if (!fields) return;

    setIsSubmittingCorrections(true);
    try {
      const response = await startCorrectionsAction({
        notionToken: fields.token,
        notionPageName: fields.page,
        notionLanguage,
      });
      localStorage.setItem(STORAGE_KEY_CORRECTIONS, response.jobId);
      setCorrectionsJobId(response.jobId);
      setPhase("correcting");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to start corrections");
    } finally {
      setIsSubmittingCorrections(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionToken, notionPageName, notionLanguage, startCorrectionsAction]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_EXPORT);
    localStorage.removeItem(STORAGE_KEY_CORRECTIONS);
    setPhase("config");
    setSubmitError(null);
    setTerminalError(null);
    // Export state
    setExportJobId(null);
    setExportCurrentStep(null);
    setExportCategoriesDesigned(null);
    setExportEntriesExtracted(null);
    setExportResult(null);
    // Corrections state
    setCorrectionsJobId(null);
    setCorrectionsCurrentStep(null);
    setCorrectionsDatabasesScanned(null);
    setCorrectionsFound(null);
    setCorrectionsApplied(null);
    setCorrectionsFailed(null);
    setCorrectionsResult(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* Restoring spinner — shown briefly while we check localStorage on mount */}
      {restoring && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {/* Scrollable content */}
      {!restoring && (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
          {/* Hero */}
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15">
              <Database className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Export Your Memory to Notion
              </h2>
              <p className="mt-2 text-balance text-sm leading-relaxed text-muted-foreground">
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
                onExport={handleExport}
                onStartCorrections={handleStartCorrections}
                error={submitError}
                isSubmittingExport={isSubmittingExport}
                isSubmittingCorrections={isSubmittingCorrections}
                hasSavedConfig={!!savedConfig?.notionToken}
              />
            )}

            {phase === "exporting" && (
              <PipelineSection
                title="Exporting…"
                subtitle="This can take a few minutes. You can leave this page and come back."
                steps={EXPORT_STEPS}
                currentStep={exportCurrentStep}
                stats={[
                  { label: "Categories", value: exportCategoriesDesigned },
                  { label: "Entries", value: exportEntriesExtracted },
                ]}
              />
            )}

            {phase === "completed" && exportResult && (
              <ExportCompletedSection result={exportResult} onReset={handleReset} />
            )}

            {phase === "failed" && (
              <FailedSection
                title="Export failed"
                error={terminalError}
                onReset={handleReset}
              />
            )}

            {phase === "correcting" && (
              <PipelineSection
                title="Syncing corrections…"
                subtitle="Reading flagged rows from Notion and applying them to your graph."
                steps={CORRECTION_STEPS}
                currentStep={correctionsCurrentStep}
                stats={[
                  { label: "Databases", value: correctionsDatabasesScanned },
                  { label: "Found", value: correctionsFound },
                  { label: "Applied", value: correctionsApplied },
                  { label: "Failed", value: correctionsFailed },
                ]}
              />
            )}

            {phase === "corrections-completed" && correctionsResult && (
              <CorrectionsCompletedSection result={correctionsResult} onReset={handleReset} />
            )}

            {phase === "corrections-failed" && (
              <FailedSection
                title="Corrections sync failed"
                error={terminalError}
                onReset={handleReset}
              />
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// =============================================================================
// Utilities (module-private)
// =============================================================================

/** Format a Cortex job error into a display string. */
function formatJobError(
  error: string | undefined,
  code: string | undefined,
  fallback: string
): string {
  if (!error) return fallback;
  return code ? `${error} (${code})` : error;
}

/** Returns true when an error indicates the job was consumed / not found. */
function isJobExpiredError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("Export job not found") ||
      err.message.includes("Corrections job not found"))
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
    <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 px-4 py-3.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
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
  onExport: (e: React.SyntheticEvent) => void;
  onStartCorrections: () => void;
  error: string | null;
  isSubmittingExport: boolean;
  isSubmittingCorrections: boolean;
  hasSavedConfig: boolean;
}

function ConfigSection({
  notionToken,
  notionPageName,
  notionLanguage,
  onTokenChange,
  onPageNameChange,
  onLanguageChange,
  onExport,
  onStartCorrections,
  error,
  isSubmittingExport,
  isSubmittingCorrections,
  hasSavedConfig,
}: ConfigSectionProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const isBusy = isSubmittingExport || isSubmittingCorrections;

  return (
    <>
      {/* Token help modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">
                How to get your integration token
              </h3>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <ol className="space-y-4 px-5 py-5 text-sm text-muted-foreground">
              <HelpStep n={1}>
                Open{" "}
                <a
                  href="https://www.notion.so/profile/integrations/internal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
                >
                  Notion Internal Integrations
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and create a new integration.
              </HelpStep>
              <HelpStep n={2}>
                Copy the{" "}
                <strong className="text-foreground/80">Internal Integration Secret</strong> —
                it starts with <code className="font-mono text-foreground/70">ntn_</code>.
              </HelpStep>
              <HelpStep n={3}>
                Create or open the Notion page you want as the parent (e.g.{" "}
                <strong className="text-foreground/80">"Synapse"</strong>).
              </HelpStep>
              <HelpStep n={4}>
                Grant access to that page. From the integrations page go to{" "}
                <strong className="text-foreground/80">Content access</strong> and add the
                page — or open the page in Notion, click{" "}
                <strong className="text-foreground/80">···</strong> →{" "}
                <strong className="text-foreground/80">Connections</strong> → select your
                integration.
              </HelpStep>
              <HelpStep n={5}>
                Paste the token above and enter the exact page name.
              </HelpStep>
            </ol>
          </div>
        </div>
      )}

      <form onSubmit={onExport} className="divide-y divide-border/40">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your credentials are saved and pre-filled for future exports.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Token field */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="notion-token" className="text-xs font-medium text-muted-foreground">
                Integration Token
              </label>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="text-[11px] text-primary underline-offset-2 hover:underline"
              >
                How to get a token?
              </button>
            </div>
            <input
              id="notion-token"
              type="password"
              value={notionToken}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder="ntn_..."
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 font-mono text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Page name + language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="notion-page" className="mb-1.5 block text-xs font-medium text-muted-foreground">
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
              <label htmlFor="notion-language" className="mb-1.5 block text-xs font-medium text-muted-foreground">
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

        {/* Actions */}
        <div className="space-y-2 px-5 py-4">
          <button
            type="submit"
            disabled={isBusy}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all",
              "hover:bg-primary/90 active:scale-[0.98]",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            {isSubmittingExport ? (
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

          {hasSavedConfig && (
            <button
              type="button"
              onClick={onStartCorrections}
              disabled={isBusy}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all",
                "hover:bg-muted hover:text-foreground active:scale-[0.98]",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              {isSubmittingCorrections ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting sync…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync Corrections from Notion
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </>
  );
}

/** Numbered step row inside the help modal. */
function HelpStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

// =============================================================================
// Pipeline section (shared by export + corrections)
// =============================================================================

interface PipelineStat {
  label: string;
  value: number | null;
}

interface PipelineSectionProps {
  title: string;
  subtitle: string;
  steps: Array<{ key: string; label: string }>;
  currentStep: string | null;
  stats: PipelineStat[];
}

function PipelineSection({ title, subtitle, steps, currentStep, stats }: PipelineSectionProps) {
  const currentIdx = currentStep ? steps.findIndex((s) => s.key === currentStep) : -1;
  const visibleStats = stats.filter((s) => s.value != null);

  return (
    <div className="divide-y divide-border/40">
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="space-y-3 px-5 py-5">
        {steps
          .filter((s) => s.key !== "done")
          .map((step, idx) => {
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

      {visibleStats.length > 0 && (
        <div className="flex gap-6 px-5 py-3">
          {visibleStats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value!} />
          ))}
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
// Export completed section
// =============================================================================

function ExportCompletedSection({
  result,
  onReset,
}: {
  result: ExportResult;
  onReset: () => void;
}) {
  const minutes = Math.round(result.durationMs / 60_000);

  return (
    <div className="divide-y divide-border/40">
      <div className="flex flex-col items-center gap-3 px-5 py-5 text-center">
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

      <div className="space-y-2 px-5 py-4">
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
// Corrections completed section
// =============================================================================

function CorrectionsCompletedSection({
  result,
  onReset,
}: {
  result: CorrectionsResult;
  onReset: () => void;
}) {
  const minutes = Math.round(result.durationMs / 60_000);
  const failedList = result.failedCorrections ?? [];

  return (
    <div className="divide-y divide-border/40">
      <div className="flex flex-col items-center gap-3 px-5 py-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Corrections applied</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.correctionsApplied} applied · {result.correctionsFound} found
            {result.correctionsFailed > 0 && ` · ${result.correctionsFailed} failed`}
            {" · "}
            {minutes > 0 ? `${minutes}m` : "<1m"}
          </p>
        </div>
      </div>

      {failedList.length > 0 && (
        <div className="space-y-1.5 px-5 py-3">
          <p className="text-[11px] font-medium text-muted-foreground">Failed corrections</p>
          {failedList.map((fc, i) => (
            <div
              key={i}
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
            >
              <span className="font-medium text-foreground/80">
                {fc.category} · {fc.title}
              </span>
              <span className="ml-2 text-muted-foreground">{fc.error}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4">
        <button
          onClick={onReset}
          className="w-full rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Failed section (shared by export + corrections)
// =============================================================================

function FailedSection({
  title,
  error,
  onReset,
}: {
  title: string;
  error: string | null;
  onReset: () => void;
}) {
  return (
    <div className="divide-y divide-border/40">
      <div className="flex flex-col items-center gap-3 px-5 py-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {error && <p className="mt-1 text-xs text-muted-foreground">{error}</p>}
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
