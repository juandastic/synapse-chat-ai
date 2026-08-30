import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@synapse/backend/api";
import { cn } from "@/lib/utils";
import { Send, ImagePlus, X, Loader2, Sparkles } from "lucide-react";
import { useChatContext } from "@/contexts/useChatContext";
import { useUploadFile } from "@convex-dev/r2/react";
import { useStreamResponse } from "@/hooks/useStreamResponse";
import { useTranslation } from "react-i18next";

const MAX_IMAGES = 4;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";
const ALLOWED_TYPES = new Set(ACCEPTED_IMAGE_TYPES.split(","));
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface ImagePreview {
  file: File;
  previewUrl: string;
  id: string;
}

type PromptMode = "legacy" | "structured";

interface ChatInputProps {
  promptState: {
    promptMode: PromptMode;
    canChangePromptMode: boolean;
  };
}

export function ChatInput({ promptState }: ChatInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isSwitchingPromptMode, setIsSwitchingPromptMode] = useState(false);
  const [localPromptMode, setLocalPromptMode] = useState<PromptMode | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isGenerating, threadId, startStreaming } = useChatContext();
  const sendMessage = useMutation(api.messages.send);
  const uploadFile = useUploadFile(api.r2);
  const streamResponse = useStreamResponse();
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);
  const setPromptModeForEmptySession = useMutation(
    api.sessions.setPromptModeForEmptySession,
  );
  const { t } = useTranslation("chat");

  const promptMode: PromptMode = localPromptMode ?? promptState.promptMode;

  // Cleanup on unmount only (not on every images change)
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalPromptMode(null);
  }, [threadId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const updateMobileState = () => setIsMobileViewport(mediaQuery.matches);
    updateMobileState();

    mediaQuery.addEventListener("change", updateMobileState);
    return () => mediaQuery.removeEventListener("change", updateMobileState);
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const processAndAddImages = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((f) => ALLOWED_TYPES.has(f.type));
      if (imageFiles.length === 0) return;

      const validImages: ImagePreview[] = [];
      let sizeError: string | null = null;

      for (const file of imageFiles) {
        if (validImages.length >= MAX_IMAGES) break;

        if (file.size > MAX_FILE_SIZE) {
          sizeError = t("chatInput.fileSizeExceeded", { filename: file.name });
          continue;
        }

        validImages.push({
          file,
          previewUrl: URL.createObjectURL(file),
          id: `${Date.now()}-${validImages.length}-${file.name}`,
        });
      }

      if (sizeError) {
        setError(sizeError);
      }

      if (validImages.length > 0) {
        setImages((prev) => {
          const remaining = MAX_IMAGES - prev.length;
          if (remaining <= 0) {
            validImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
            return prev;
          }
          const toAdd = validImages.slice(0, remaining);
          validImages
            .slice(remaining)
            .forEach((img) => URL.revokeObjectURL(img.previewUrl));
          return [...prev, ...toAdd];
        });
      }
    },
    [t],
  );

  const handleAddImages = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesArray = Array.from(fileList);
      e.target.value = ""; // allow re-selecting same file
      processAndAddImages(filesArray);
    },
    [processAndAddImages],
  );

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();
    const hasImages = images.length > 0;

    if (!trimmedContent && !hasImages) return;
    if (isSubmitting || isGenerating || isSwitchingPromptMode) return;

    setIsSubmitting(true);
    setError(null);

    const savedContent = content;
    const savedImages = [...images];

    // Optimistic clear — restored on error
    setContent("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      let imageKeys: string[] | undefined;
      if (hasImages) {
        setIsUploading(true);
        const uploadPromises = savedImages.map((img) => uploadFile(img.file));
        imageKeys = await Promise.all(uploadPromises);
        setIsUploading(false);
      }

      savedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));

      const result = await sendMessage({
        threadId,
        content: trimmedContent,
        ...(imageKeys && imageKeys.length > 0 ? { imageKeys } : {}),
      });

      startStreaming(result.assistantMessageId);
      void streamResponse(result.assistantMessageId, result.sessionId);
    } catch (err) {
      setContent(savedContent);
      setImages(savedImages);
      setIsUploading(false);
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      console.error("[ChatInput] Failed to send message:", err);
    } finally {
      setIsSubmitting(false);
      textareaRef.current?.focus();
    }
  }, [
    content,
    images,
    isSubmitting,
    isGenerating,
    isSwitchingPromptMode,
    sendMessage,
    threadId,
    uploadFile,
    startStreaming,
    streamResponse,
  ]);

  const handlePromptModeToggle = useCallback(async () => {
    if (
      !promptState.canChangePromptMode ||
      isSubmitting ||
      isGenerating ||
      isSwitchingPromptMode
    ) {
      return;
    }

    const previousMode = promptMode;
    const nextMode: PromptMode =
      previousMode === "structured" ? "legacy" : "structured";

    setLocalPromptMode(nextMode);
    setIsSwitchingPromptMode(true);
    setError(null);
    try {
      await setPromptModeForEmptySession({ threadId, promptMode: nextMode });
      setLocalPromptMode(null);
    } catch (err) {
      setLocalPromptMode(null);
      setError(t("chatInput.promptModeUpdateFailed"));
      console.error("[ChatInput] Failed to update prompt mode:", err);
    } finally {
      setIsSwitchingPromptMode(false);
    }
  }, [
    promptState.canChangePromptMode,
    isSubmitting,
    isGenerating,
    isSwitchingPromptMode,
    promptMode,
    setPromptModeForEmptySession,
    threadId,
    t,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isMobileViewport && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isMobileViewport],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;

      const imageFiles = Array.from(files).filter((f) =>
        ALLOWED_TYPES.has(f.type),
      );
      if (imageFiles.length > 0) {
        e.preventDefault();
        processAndAddImages(imageFiles);
      }
    },
    [processAndAddImages],
  );

  const dragCounterRef = useRef(0);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const imageFiles = Array.from(files).filter((f) =>
        ALLOWED_TYPES.has(f.type),
      );
      if (imageFiles.length > 0) {
        processAndAddImages(imageFiles);
      }
    },
    [processAndAddImages],
  );

  // Usage limits
  const msgLimit = usageStatus?.dailyMessages;
  const isUnlimited = msgLimit?.limit === -1;
  const isAtLimit =
    !isUnlimited && msgLimit != null && msgLimit.used >= msgLimit.limit;
  const usagePercent =
    !isUnlimited && msgLimit ? msgLimit.used / msgLimit.limit : 0;

  const isDisabled =
    isSubmitting || isGenerating || isSwitchingPromptMode || isAtLimit;
  const canSubmit =
    (content.trim().length > 0 || images.length > 0) && !isDisabled;
  const canAttach = images.length < MAX_IMAGES && !isDisabled;
  const canChangePromptMode =
    promptState.canChangePromptMode &&
    !isSubmitting &&
    !isGenerating &&
    !isSwitchingPromptMode;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div
        className={cn(
          "relative rounded-2xl border border-border/50 bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/20",
          isDragging && "ring-2 ring-primary/30",
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hidden via size/opacity (not display:none) for mobile Safari .click() compat */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          aria-label={t("chatInput.attachImages")}
          className="absolute h-0 w-0 overflow-hidden opacity-0"
          onChange={handleAddImages}
          tabIndex={-1}
        />

        <div className="px-2 pt-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (error) setError(null);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isGenerating
                ? t("chatInput.waitingForResponse")
                : t("chatInput.placeholder")
            }
            disabled={isDisabled}
            rows={1}
            className={cn(
              "max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50",
              isDisabled && "cursor-not-allowed",
            )}
          />
        </div>

        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/50"
              >
                <img
                  src={img.previewUrl}
                  alt={t("chatInput.attachmentPreview")}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  aria-label={t("chatInput.removeImage")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={openFilePicker}
              disabled={!canAttach}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                canAttach
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
              aria-label={t("chatInput.attachImages")}
              title={
                canAttach
                  ? t("chatInput.attachImages")
                  : t("chatInput.maxImages", { count: MAX_IMAGES })
              }
            >
              <ImagePlus className="h-5 w-5" />
            </button>

            {images.length > 0 && (
              <span className="text-xs text-muted-foreground/60">
                {images.length}/{MAX_IMAGES}
              </span>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={promptMode === "structured"}
              onClick={handlePromptModeToggle}
              disabled={!canChangePromptMode}
              aria-busy={isSwitchingPromptMode}
              className={cn(
                "ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                promptMode === "structured"
                  ? "border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                  : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                !canChangePromptMode && "cursor-not-allowed opacity-50",
              )}
              title={
                !canChangePromptMode
                  ? t("chatInput.promptModeLockedDescription")
                  : promptMode === "structured"
                    ? t("chatInput.structuredVoiceOnDescription")
                    : t("chatInput.structuredVoiceOffDescription")
              }
            >
              {isSwitchingPromptMode ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{t("chatInput.structuredVoiceBeta")}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  promptMode === "structured"
                    ? "bg-violet-500"
                    : "bg-muted-foreground/40",
                )}
              />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
              canSubmit
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
            aria-label={t("chatInput.sendMessage")}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSubmitting || isGenerating ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Usage indicator — hidden for unlimited plans */}
      {!isUnlimited &&
        msgLimit != null &&
        (isAtLimit ? (
          <div className="mt-2 text-center text-xs space-y-1">
            <p className="text-destructive font-medium">
              {t("chatInput.dailyLimitReached", { limit: msgLimit.limit })}
            </p>
            <p className="text-muted-foreground/60">
              {t("chatInput.resetInfo", { info: usageStatus?.resetInfo })}{" "}
              <a
                href={usageStatus?.contactInfo.x}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                x.com/juandastic
              </a>{" "}
              {t("chatInput.or")}{" "}
              <a
                href={`mailto:${usageStatus?.contactInfo.email}`}
                className="underline hover:text-foreground transition-colors"
              >
                {usageStatus?.contactInfo.email}
              </a>
            </p>
          </div>
        ) : (
          <p
            className={cn(
              "mt-2 text-center text-xs",
              usagePercent >= 0.8
                ? "text-amber-500"
                : "text-muted-foreground/60",
            )}
          >
            {t("chatInput.messagesUsage", {
              used: msgLimit.used,
              limit: msgLimit.limit,
            })}
          </p>
        ))}

      <p className="mt-2 text-center text-xs text-muted-foreground/60">
        {isMobileViewport
          ? t("chatInput.mobileHint")
          : t("chatInput.desktopHint")}
      </p>
    </div>
  );
}
