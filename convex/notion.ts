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

// =============================================================================
// Public Actions
// =============================================================================

/**
 * Kick off a Notion export job.
 * Saves the provided config, then calls POST /v1/notion/export.
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

    // Persist config before calling the API
    await ctx.runMutation(internal.notionConfig.saveNotionConfigInternal, {
      userId: userId as Id<"users">,
      notionToken: args.notionToken,
      notionPageName: args.notionPageName,
      notionLanguage: args.notionLanguage,
    });

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      throw new Error("Cortex API secret not configured");
    }

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
      let message = `Export request failed (${response.status})`;
      try {
        const json = JSON.parse(body);
        if (json.detail) message = json.detail;
        else if (json.message) message = json.message;
        else if (json.error) message = json.error;
      } catch {
        // use default message
      }
      throw new Error(message);
    }

    const data: ExportStartResponse = await response.json();
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

    const apiSecret = process.env.SYNAPSE_CORTEX_API_SECRET;
    if (!apiSecret) {
      throw new Error("Cortex API secret not configured");
    }

    const response = await globalThis.fetch(
      `${CORTEX_API_BASE_URL}/v1/notion/export/status/${encodeURIComponent(args.jobId)}`,
      {
        method: "GET",
        headers: { "X-API-SECRET": apiSecret },
      }
    );

    if (response.status === 404) {
      console.warn("[notion.getExportStatus] Export job not found", {
        jobId: args.jobId,
      });
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
