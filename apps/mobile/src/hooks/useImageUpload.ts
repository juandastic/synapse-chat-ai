import { useCallback } from "react";
import { useMutation } from "convex/react";
import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import { api } from "@synapse/backend/api";

import type { PickedImage } from "./useImagePicker";

export type ImageUploadStage =
  | "prepare_file"
  | "generate_upload_url"
  | "upload_to_storage"
  | "sync_metadata";

export interface ImageUploadTelemetry {
  upload_stage: ImageUploadStage;
  uri_scheme: string;
  mime_type: string;
  file_size_bytes?: number;
  storage_host?: string;
  http_status?: number;
  technical_message?: string;
  duration_ms: number;
}

export class ImageUploadError extends Error {
  readonly telemetry: ImageUploadTelemetry;

  constructor(message: string, telemetry: ImageUploadTelemetry) {
    super(message);
    this.name = "ImageUploadError";
    this.telemetry = telemetry;
  }
}

export interface ImageUploadResult {
  key: string;
  telemetry: Omit<ImageUploadTelemetry, "upload_stage">;
}

function getUriScheme(uri: string): string {
  return uri.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? "unknown";
}

function getStorageHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** Keep diagnostics useful without sending signed URLs or local file paths. */
function sanitizeTechnicalMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(?:file|content):\/\/\S+/gi, "[redacted-file-uri]")
    .slice(0, 500);
}

function uploadError(
  stage: ImageUploadStage,
  message: string,
  startedAt: number,
  base: Omit<ImageUploadTelemetry, "upload_stage" | "duration_ms">,
  error?: unknown,
  extra?: Partial<ImageUploadTelemetry>
): ImageUploadError {
  return new ImageUploadError(message, {
    ...base,
    ...extra,
    upload_stage: stage,
    duration_ms: Date.now() - startedAt,
    ...(error === undefined
      ? {}
      : { technical_message: sanitizeTechnicalMessage(error) }),
  });
}

/**
 * Uploads ImagePicker files without routing a local file:// URI through the
 * React Native network stack. ExpoFile implements Blob and expo/fetch can
 * stream it as the raw body expected by R2's signed PUT URL.
 */
export function useImageUpload() {
  const generateUploadUrl = useMutation(api.r2.generateUploadUrl);
  const syncMetadata = useMutation(api.r2.syncMetadata);

  return useCallback(
    async (image: PickedImage): Promise<ImageUploadResult> => {
      const startedAt = Date.now();
      const baseTelemetry = {
        uri_scheme: getUriScheme(image.uri),
        mime_type: image.mimeType || "application/octet-stream",
        ...(image.fileSize === undefined
          ? {}
          : { file_size_bytes: image.fileSize }),
      };

      let file: ExpoFile;
      try {
        file = new ExpoFile(image.uri);
        if (!file.exists) {
          throw new Error("Selected image is no longer available");
        }
      } catch (error) {
        throw uploadError(
          "prepare_file",
          "Unable to read the selected image",
          startedAt,
          baseTelemetry,
          error
        );
      }

      const fileSize = image.fileSize ?? file.size;
      const mimeType = image.mimeType || file.type || "application/octet-stream";
      const fileTelemetry = {
        ...baseTelemetry,
        mime_type: mimeType,
        ...(Number.isFinite(fileSize) ? { file_size_bytes: fileSize } : {}),
      };

      let uploadUrl: string;
      let key: string;
      try {
        const generated = await generateUploadUrl();
        uploadUrl = generated.url;
        key = generated.key;
      } catch (error) {
        throw uploadError(
          "generate_upload_url",
          "Unable to prepare the image upload",
          startedAt,
          fileTelemetry,
          error
        );
      }

      const storageHost = getStorageHost(uploadUrl);
      const remoteTelemetry = {
        ...fileTelemetry,
        ...(storageHost ? { storage_host: storageHost } : {}),
      };

      try {
        const response = await expoFetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });

        if (!response.ok) {
          throw uploadError(
            "upload_to_storage",
            `Storage rejected the image upload with HTTP ${response.status}`,
            startedAt,
            remoteTelemetry,
            undefined,
            { http_status: response.status }
          );
        }
      } catch (error) {
        if (error instanceof ImageUploadError) throw error;
        throw uploadError(
          "upload_to_storage",
          "Unable to transfer the image to storage",
          startedAt,
          remoteTelemetry,
          error
        );
      }

      try {
        await syncMetadata({ key });
      } catch (error) {
        throw uploadError(
          "sync_metadata",
          "The image uploaded, but its metadata could not be saved",
          startedAt,
          remoteTelemetry,
          error
        );
      }

      return {
        key,
        telemetry: {
          ...remoteTelemetry,
          duration_ms: Date.now() - startedAt,
        },
      };
    },
    [generateUploadUrl, syncMetadata]
  );
}

export function getImageUploadErrorTelemetry(
  error: unknown
): ImageUploadTelemetry | null {
  return error instanceof ImageUploadError ? error.telemetry : null;
}
