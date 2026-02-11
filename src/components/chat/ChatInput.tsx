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
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { useChatContext } from "@/contexts/useChatContext";
import { useUploadFile } from "@convex-dev/r2/react";

const MAX_IMAGES = 4;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";
const ALLOWED_TYPES = new Set(ACCEPTED_IMAGE_TYPES.split(","));
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface ImagePreview {
  file: File;
  previewUrl: string;
  id: string;
}

export function ChatInput() {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isGenerating, threadId } = useChatContext();
  const sendMessage = useMutation(api.messages.send);
  const uploadFile = useUploadFile(api.r2);

  // Cleanup on unmount only (not on every images change)
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const processAndAddImages = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => ALLOWED_TYPES.has(f.type));
    if (imageFiles.length === 0) return;

    const validImages: ImagePreview[] = [];
    let sizeError: string | null = null;

    for (const file of imageFiles) {
      if (validImages.length >= MAX_IMAGES) break;

      if (file.size > MAX_FILE_SIZE) {
        sizeError = `${file.name} exceeds 10MB limit`;
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
  }, []);

  const handleAddImages = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesArray = Array.from(fileList);
      e.target.value = ""; // allow re-selecting same file
      processAndAddImages(filesArray);
    },
    [processAndAddImages]
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
    if (isSubmitting || isGenerating) return;

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

      await sendMessage({
        threadId,
        content: trimmedContent,
        ...(imageKeys && imageKeys.length > 0 ? { imageKeys } : {}),
      });
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
    sendMessage,
    threadId,
    uploadFile,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;

      const imageFiles = Array.from(files).filter((f) => ALLOWED_TYPES.has(f.type));
      if (imageFiles.length > 0) {
        e.preventDefault();
        processAndAddImages(imageFiles);
      }
    },
    [processAndAddImages]
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

      const imageFiles = Array.from(files).filter((f) => ALLOWED_TYPES.has(f.type));
      if (imageFiles.length > 0) {
        processAndAddImages(imageFiles);
      }
    },
    [processAndAddImages]
  );

  const isDisabled = isSubmitting || isGenerating;
  const canSubmit =
    (content.trim().length > 0 || images.length > 0) && !isDisabled;
  const canAttach = images.length < MAX_IMAGES && !isDisabled;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div
        className={cn(
          "relative rounded-2xl border border-border/50 bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/20",
          isDragging && "ring-2 ring-primary/30"
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
                ? "Waiting for response..."
                : "Share what's on your mind..."
            }
            disabled={isDisabled}
            rows={1}
            className={cn(
              "max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50",
              isDisabled && "cursor-not-allowed"
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
                  alt="Attachment preview"
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  aria-label="Remove image"
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
                  : "text-muted-foreground/30 cursor-not-allowed"
              )}
              aria-label="Attach images"
              title={
                canAttach
                  ? "Attach images"
                  : `Maximum ${MAX_IMAGES} images`
              }
            >
              <ImagePlus className="h-5 w-5" />
            </button>

            {images.length > 0 && (
              <span className="text-xs text-muted-foreground/60">
                {images.length}/{MAX_IMAGES}
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
              canSubmit
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            aria-label="Send message"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDisabled ? (
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

      <p className="mt-2 text-center text-xs text-muted-foreground/60">
        Press Enter to send, Shift+Enter for new line. Paste or drag images to
        attach.
      </p>
    </div>
  );
}
