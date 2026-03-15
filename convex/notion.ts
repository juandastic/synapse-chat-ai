"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { CORTEX_API_BASE_URL } from "./cortexConfig";

// =============================================================================
// Types
// =============================================================================

interface ExportStartResponse {
  jobId: string;
  status: string;
  pageId: string;
}

interface ExportProgress {
  currentStep: string;
  categoriesDesigned?: number;
  entriesExtracted?: number;
}

interface ExportResult {
  summaryPageUrl: string;
  categoriesCount: number;
  entriesCount: number;
  durationMs: number;
}

export interface ExportStatusResponse {
  jobId: string;
  status: "processing" | "completed" | "failed";
  progress?: ExportProgress;
  result?: ExportResult;
  error?: string;
  code?: string;
}

interface CorrectionsStartResponse {
  jobId: string;
  status: string;
  pageId: string;
}

interface CorrectionsProgress {
  currentStep: string;
  databasesScanned?: number;
  correctionsFound?: number;
  correctionsApplied?: number;
  correctionsFailed?: number;
}

interface CorrectionsResult {
  correctionsFound: number;
  correctionsApplied: number;
  correctionsFailed: number;
  failedCorrections: Array<{ category: string; title: string; error: string }>;
  durationMs: number;
}

export interface CorrectionsStatusResponse {
  jobId: string;
  status: "processing" | "completed" | "failed";
  progress?: CorrectionsProgress;
  result?: CorrectionsResult;
  error?: string;
  code?: string;
}

// =============================================================================
// Helpers
// =============================================================================

async function resolveUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }

  const user = await ctx.runQuery(internal.users.getByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user._id;
}

/** Read and validate the Cortex API secret from the environment. */
function getApiSecret(): string {
  const secret = process.env.SYNAPSE_CORTEX_API_SECRET;
  if (!secret) {
    throw new Error("Cortex API secret not configured");
  }
  return secret;
}

/**
 * Extract a human-readable error message from a Cortex error response body.
 * Falls back to `defaultMessage` if the body cannot be parsed.
 */
function extractErrorMessage(body: string, defaultMessage: string): string {
  try {
    const json = JSON.parse(body);
    return json.detail ?? json.message ?? json.error ?? defaultMessage;
  } catch {
    return defaultMessage;
  }
}

// =============================================================================
// Public Actions
// =============================================================================

/**
 * Kick off a Notion export job.
 * Persists the provided config, then calls POST /v1/notion/export.
 * Returns the jobId to poll for status.
 */
export const startExport = action({
  args: {
    notionToken: v.string(),
    notionPageName: v.string(),
    notionLanguage: v.string(),
  },
  handler: async (ctx, args): Promise<ExportStartResponse> => {
    const userId = await resolveUserId(ctx);
    const apiSecret = getApiSecret();

    console.log("[notion.startExport] Starting export", {
      userId,
      pageName: args.notionPageName,
      language: args.notionLanguage,
    });

    // Persist config before calling the API so it pre-fills on next visit.
    await ctx.runMutation(internal.notionConfig.saveNotionConfigInternal, {
      userId: userId as Id<"users">,
      notionToken: args.notionToken,
      notionPageName: args.notionPageName,
      notionLanguage: args.notionLanguage,
    });

    const response = await globalThis.fetch(
      `${CORTEX_API_BASE_URL}/v1/notion/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": apiSecret,
        },
        body: JSON.stringify({
          userId,
          notionToken: args.notionToken,
          pageName: args.notionPageName,
          language: args.notionLanguage,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = extractErrorMessage(body, `Export request failed (${response.status})`);
      console.warn("[notion.startExport] Request failed", { userId, status: response.status, message });
      throw new Error(message);
    }

    const data: ExportStartResponse = await response.json();
    console.log("[notion.startExport] Export job accepted", { userId, jobId: data.jobId });
    return data;
  },
});

/**
 * Poll for the status of a running Notion export job.
 * Returns the current status object from Cortex.
 */
export const getExportStatus = action({
  args: { jobId: v.string() },
  handler: async (ctx, args): Promise<ExportStatusResponse> => {
    await resolveUserId(ctx);
    const apiSecret = getApiSecret();

    const response = await globalThis.fetch(
      `${CORTEX_API_BASE_URL}/v1/notion/export/status/${encodeURIComponent(args.jobId)}`,
      {
        method: "GET",
        headers: { "X-API-SECRET": apiSecret },
      }
    );

    if (response.status === 404) {
      console.warn("[notion.getExportStatus] Export job not found", { jobId: args.jobId });
      throw new Error("Export job not found");
    }

    if (!response.ok) {
      console.warn("[notion.getExportStatus] Status check failed", {
        jobId: args.jobId,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Status check failed (${response.status})`);
    }

    const raw = await response.json();

    // Strip databaseIds — keys can contain non-ASCII characters (e.g. "Metas y Obstáculos")
    // which Convex rejects when serializing the action return value.
    const result: ExportStatusResponse["result"] = raw.result
      ? {
          summaryPageUrl: raw.result.summaryPageUrl,
          categoriesCount: raw.result.categoriesCount,
          entriesCount: raw.result.entriesCount,
          durationMs: raw.result.durationMs,
        }
      : undefined;

    const data: ExportStatusResponse = {
      jobId: raw.jobId,
      status: raw.status,
      progress: raw.progress,
      result,
      error: raw.error,
      code: raw.code,
    };

    console.log("[notion.getExportStatus] Status check successful", {
      jobId: args.jobId,
      status: data.status,
      progress: data.progress,
    });
    return data;
  },
});

/**
 * Kick off a Notion corrections job.
 * Reads rows flagged "Needs Review" from the exported Notion databases and
 * applies them back into the knowledge graph via Cortex.
 */
export const startCorrections = action({
  args: {
    notionToken: v.string(),
    notionPageName: v.string(),
    notionLanguage: v.string(),
  },
  handler: async (ctx, args): Promise<CorrectionsStartResponse> => {
    const userId = await resolveUserId(ctx);
    const apiSecret = getApiSecret();

    console.log("[notion.startCorrections] Starting corrections sync", {
      userId,
      pageName: args.notionPageName,
      language: args.notionLanguage,
    });

    const response = await globalThis.fetch(
      `${CORTEX_API_BASE_URL}/v1/notion/corrections`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": apiSecret,
        },
        body: JSON.stringify({
          userId,
          notionToken: args.notionToken,
          pageName: args.notionPageName,
          language: args.notionLanguage,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = extractErrorMessage(body, `Corrections request failed (${response.status})`);
      console.warn("[notion.startCorrections] Request failed", { userId, status: response.status, message });
      throw new Error(message);
    }

    const data: CorrectionsStartResponse = await response.json();
    console.log("[notion.startCorrections] Corrections job accepted", { userId, jobId: data.jobId });
    return data;
  },
});

/**
 * Poll for the status of a running Notion corrections job.
 * Returns the current status object from Cortex.
 */
export const getCorrectionsStatus = action({
  args: { jobId: v.string() },
  handler: async (ctx, args): Promise<CorrectionsStatusResponse> => {
    await resolveUserId(ctx);
    const apiSecret = getApiSecret();

    const response = await globalThis.fetch(
      `${CORTEX_API_BASE_URL}/v1/notion/corrections/status/${encodeURIComponent(args.jobId)}`,
      {
        method: "GET",
        headers: { "X-API-SECRET": apiSecret },
      }
    );

    if (response.status === 404) {
      console.warn("[notion.getCorrectionsStatus] Corrections job not found", { jobId: args.jobId });
      throw new Error("Corrections job not found");
    }

    if (!response.ok) {
      console.warn("[notion.getCorrectionsStatus] Status check failed", {
        jobId: args.jobId,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Status check failed (${response.status})`);
    }

    const raw = await response.json();

    const data: CorrectionsStatusResponse = {
      jobId: raw.jobId,
      status: raw.status,
      progress: raw.progress,
      result: raw.result,
      error: raw.error,
      code: raw.code,
    };

    console.log("[notion.getCorrectionsStatus] Status check successful", {
      jobId: args.jobId,
      status: data.status,
      progress: data.progress,
    });
    return data;
  },
});
