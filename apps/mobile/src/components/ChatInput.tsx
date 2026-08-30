import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Send, ImagePlus, Pencil, X, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { captureError } from "../lib/analytics";

import { useTheme } from "../contexts/ThemeContext";
import { useChatContext } from "../contexts/useChatContext";
import { useStreamResponse } from "../hooks/useStreamResponse";
import { useImagePicker, PickedImage } from "../hooks/useImagePicker";
import {
  getImageUploadErrorTelemetry,
  ImageUploadError,
  useImageUpload,
} from "../hooks/useImageUpload";

type PromptMode = "legacy" | "structured";

interface ChatInputProps {
  threadId: Id<"threads">;
  promptState?: {
    promptMode: PromptMode;
    canChangePromptMode: boolean;
  };
}

export function ChatInput({ threadId, promptState }: ChatInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitchingPromptMode, setIsSwitchingPromptMode] = useState(false);
  const [localPromptMode, setLocalPromptMode] = useState<PromptMode | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const textInputRef = useRef<TextInput>(null);
  const { colors, theme } = useTheme();

  const {
    isGenerating,
    startStreaming,
    editingMessage,
    cancelEditing,
  } = useChatContext();
  const sendMessage = useMutation(api.messages.send);
  const editLastMessageAndResend = useMutation(
    api.messages.editLastMessageAndResend,
  );
  const setPromptModeForEmptySession = useMutation(
    api.sessions.setPromptModeForEmptySession,
  );
  const uploadImage = useImageUpload();
  const streamResponse = useStreamResponse();
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);
  const posthog = usePostHog();
  const { t, i18n } = useTranslation("chat");
  const insets = useSafeAreaInsets();

  const promptMode: PromptMode =
    localPromptMode ?? promptState?.promptMode ?? "legacy";

  const {
    images,
    pickImages,
    removeImage,
    clearImages,
    restoreImages,
    maxImages,
  } = useImagePicker();

  useEffect(() => {
    if (!editingMessage) return;

    setContent(editingMessage.content);
    clearImages();
    setError(null);

    const focusTimer = setTimeout(() => textInputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [editingMessage, clearImages]);

  useEffect(() => {
    setLocalPromptMode(null);
  }, [threadId]);

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();
    const hasImages = images.length > 0;

    if (!trimmedContent && !hasImages) return;
    if (isSubmitting || isGenerating || isSwitchingPromptMode) return;

    setIsSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const savedContent = content;
    const savedImages = [...images];

    // Optimistic clear
    setContent("");
    clearImages();

    try {
      let imageKeys: string[] | undefined;
      if (hasImages) {
        setIsUploading(true);
        const uploadPromises = savedImages.map(
          async (img: PickedImage, index) => {
            const operationId = `${Date.now()}-${index}-${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            const startedAt = Date.now();

            posthog?.capture("image_upload_started_mobile", {
              operation_id: operationId,
              thread_id: threadId,
              image_index: index,
              image_count: savedImages.length,
              mime_type: img.mimeType,
              ...(img.fileSize === undefined
                ? {}
                : { file_size_bytes: img.fileSize }),
              uri_scheme: img.uri.split(":", 1)[0] || "unknown",
            });

            try {
              const result = await uploadImage(img);
              posthog?.capture("image_upload_succeeded_mobile", {
                operation_id: operationId,
                thread_id: threadId,
                image_index: index,
                image_count: savedImages.length,
                ...result.telemetry,
              });
              return result.key;
            } catch (uploadError) {
              const telemetry = getImageUploadErrorTelemetry(uploadError);
              const failureContext = {
                operation_id: operationId,
                thread_id: threadId,
                image_index: index,
                image_count: savedImages.length,
                duration_ms: Date.now() - startedAt,
                ...(telemetry ?? {}),
              };
              posthog?.capture("image_upload_failed_mobile", failureContext);
              captureError(uploadError, {
                source: "chat_input",
                action: "upload_image",
                ...failureContext,
              });
              throw uploadError;
            }
          },
        );
        imageKeys = await Promise.all(uploadPromises);
        setIsUploading(false);
      }

      const result = editingMessage
        ? await editLastMessageAndResend({
            messageId: editingMessage._id,
            content: trimmedContent,
          })
        : await sendMessage({
            threadId,
            content: trimmedContent,
            ...(imageKeys && imageKeys.length > 0 ? { imageKeys } : {}),
          });

      posthog?.capture(
        editingMessage ? "message_edited_mobile" : "message_sent_mobile",
        {
          thread_id: threadId,
          has_images: hasImages,
          image_count: savedImages.length,
        },
      );

      if (editingMessage) cancelEditing();

      startStreaming(result.assistantMessageId);
      void streamResponse(result.assistantMessageId, result.sessionId);
    } catch (err) {
      setContent(savedContent);
      restoreImages(savedImages);
      setIsUploading(false);
      const uploadTelemetry = getImageUploadErrorTelemetry(err);
      const message =
        err instanceof ImageUploadError
          ? err.telemetry.upload_stage === "prepare_file"
            ? t("chatInput.imageReadFailed")
            : t("chatInput.imageUploadFailed")
          : err instanceof Error
            ? err.message
            : t("chatInput.sendFailed");
      setError(message);
      console.error("[ChatInput] Failed to send message:", err);
      // Upload failures are captured at the per-image boundary above so the
      // exception shares an operation_id with its started/failed events.
      if (!uploadTelemetry) {
        captureError(err, {
          source: "chat_input",
          action: "send_message",
          thread_id: threadId,
          has_images: hasImages,
          image_count: savedImages.length,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    images,
    isSubmitting,
    isGenerating,
    isSwitchingPromptMode,
    editingMessage,
    sendMessage,
    editLastMessageAndResend,
    uploadImage,
    threadId,
    startStreaming,
    streamResponse,
    clearImages,
    restoreImages,
    cancelEditing,
    posthog,
    t,
  ]);

  const handleCancelEditing = useCallback(() => {
    setContent("");
    clearImages();
    setError(null);
    cancelEditing();
  }, [cancelEditing, clearImages]);

  const handlePromptModeToggle = useCallback(async () => {
    if (
      !promptState?.canChangePromptMode ||
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
    void Haptics.selectionAsync();

    try {
      await setPromptModeForEmptySession({ threadId, promptMode: nextMode });
      setLocalPromptMode(null);
    } catch (err) {
      setLocalPromptMode(null);
      setError(t("chatInput.promptModeUpdateFailed"));
      captureError(err, {
        source: "chat_input",
        action: "set_prompt_mode",
        thread_id: threadId,
        prompt_mode: nextMode,
      });
    } finally {
      setIsSwitchingPromptMode(false);
    }
  }, [
    promptState?.canChangePromptMode,
    isSubmitting,
    isGenerating,
    isSwitchingPromptMode,
    promptMode,
    setPromptModeForEmptySession,
    threadId,
    t,
  ]);

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
    (content.trim().length > 0 || images.length > 0) &&
    !isDisabled;
  const canAttach =
    !editingMessage && images.length < maxImages && !isDisabled;
  const canChangePromptMode =
    promptState?.canChangePromptMode === true &&
    !isSubmitting &&
    !isGenerating &&
    !isSwitchingPromptMode;

  const s = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          paddingHorizontal: 12,
          paddingTop: 6,
          backgroundColor: colors.paper,
        },
        container: {
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.card,
          overflow: "hidden",
        },
        imageStrip: {
          maxHeight: 72,
        },
        editingBar: {
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 12,
          paddingRight: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
          backgroundColor: colors.accentLight,
        },
        editingLabel: {
          flex: 1,
          fontSize: 12,
          fontWeight: "600",
          color: colors.ink,
        },
        cancelEditingButton: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
        },
        imageStripContent: {
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
        },
        imagePreview: {
          width: 56,
          height: 56,
          borderRadius: 8,
          overflow: "hidden",
        },
        previewImage: {
          width: 56,
          height: 56,
        },
        removeImageButton: {
          position: "absolute",
          top: -2,
          right: -2,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.error,
          alignItems: "center",
          justifyContent: "center",
        },
        inputRow: {
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 4,
          paddingVertical: 4,
        },
        promptModeRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          paddingBottom: 8,
        },
        promptModeButton: {
          minHeight: 34,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 7,
        },
        promptModeButtonActive: {
          borderColor:
            theme === "dark"
              ? "rgba(196, 181, 253, 0.4)"
              : "rgba(124, 58, 237, 0.35)",
          backgroundColor:
            theme === "dark"
              ? "rgba(139, 92, 246, 0.14)"
              : "rgba(139, 92, 246, 0.1)",
        },
        promptModeButtonInactive: {
          borderColor: colors.rule,
          backgroundColor: "transparent",
        },
        promptModeButtonDisabled: {
          opacity: 0.5,
        },
        promptModeText: {
          fontSize: 12,
          fontWeight: "600",
          color: colors.inkMuted,
        },
        promptModeTextActive: {
          color: theme === "dark" ? "#c4b5fd" : "#7c3aed",
        },
        promptModeDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.inkMuted,
          opacity: 0.45,
        },
        promptModeDotActive: {
          backgroundColor: theme === "dark" ? "#a78bfa" : "#7c3aed",
          opacity: 1,
        },
        attachButton: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        attachButtonDisabled: {
          opacity: 0.4,
        },
        textInput: {
          flex: 1,
          fontSize: 15,
          lineHeight: 20,
          color: colors.ink,
          maxHeight: 120,
          paddingVertical: 8,
          paddingHorizontal: 4,
        },
        sendButton: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        sendButtonActive: {
          backgroundColor: colors.primary,
        },
        sendButtonDisabled: {
          backgroundColor: colors.accentLight,
        },
        errorText: {
          fontSize: 12,
          color: colors.error,
          textAlign: "center",
          marginTop: 6,
        },
        usage: {
          fontSize: 11,
          color: colors.inkMuted,
          textAlign: "center",
          marginTop: 6,
        },
        usageWarning: {
          color: colors.amber,
        },
        limitReached: {
          fontSize: 12,
          color: colors.error,
          textAlign: "center",
          marginTop: 6,
          fontWeight: "500",
        },
        aiDisclaimer: {
          fontSize: 10,
          color: colors.inkMuted,
          textAlign: "center",
          marginTop: 0,
          opacity: 0.7,
        },
      }),
    [colors, theme],
  );

  return (
    <View
      style={[
        s.wrapper,
        {
          paddingBottom: Math.max(4, insets.bottom),
        },
      ]}
    >
      <View style={s.container}>
        {editingMessage && (
          <View style={s.editingBar}>
            <Pencil size={14} color={colors.accent} />
            <Text style={s.editingLabel}>{t("chatInput.editingMessage")}</Text>
            <Pressable
              style={s.cancelEditingButton}
              onPress={handleCancelEditing}
              accessibilityLabel={t("chatInput.cancelEditing")}
            >
              <X size={17} color={colors.inkMuted} />
            </Pressable>
          </View>
        )}

        {/* Image previews */}
        {images.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.imageStrip}
            contentContainerStyle={s.imageStripContent}
          >
            {images.map((img) => (
              <View key={img.id} style={s.imagePreview}>
                <Image source={{ uri: img.uri }} style={s.previewImage} />
                <Pressable
                  style={s.removeImageButton}
                  onPress={() => removeImage(img.id)}
                  accessibilityLabel={t("chatInput.removeImage")}
                >
                  <X size={12} color={colors.white} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Input row */}
        <View style={s.inputRow}>
          <Pressable
            style={[s.attachButton, !canAttach && s.attachButtonDisabled]}
            onPress={pickImages}
            disabled={!canAttach}
            accessibilityLabel={t("chatInput.attachImages")}
          >
            <ImagePlus
              size={20}
              color={canAttach ? colors.inkMuted : colors.rule}
            />
          </Pressable>

          <TextInput
            ref={textInputRef}
            style={s.textInput}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              if (error) setError(null);
            }}
            placeholder={
              isGenerating
                ? t("chatInput.waitingForResponse")
                : editingMessage
                  ? t("chatInput.editPlaceholder")
                  : t("chatInput.placeholder")
            }
            placeholderTextColor={colors.inkMuted}
            multiline
            // @ts-expect-error -- bounces is not in RN types but passed through to UIScrollView on iOS
            bounces={false}
            maxLength={10000}
            editable={!isDisabled}
            returnKeyType="default"
          />

          <Pressable
            style={[
              s.sendButton,
              canSubmit ? s.sendButtonActive : s.sendButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityLabel={t("chatInput.sendMessage")}
          >
            {isUploading || isSubmitting || isGenerating ? (
              <ActivityIndicator
                size="small"
                color={canSubmit ? colors.primaryForeground : colors.inkMuted}
              />
            ) : (
              <Send
                size={18}
                color={canSubmit ? colors.primaryForeground : colors.inkMuted}
              />
            )}
          </Pressable>
        </View>

        {promptState && (
          <View style={s.promptModeRow}>
            <Pressable
              style={[
                s.promptModeButton,
                promptMode === "structured"
                  ? s.promptModeButtonActive
                  : s.promptModeButtonInactive,
                !canChangePromptMode && s.promptModeButtonDisabled,
              ]}
              onPress={handlePromptModeToggle}
              disabled={!canChangePromptMode}
              accessibilityRole="switch"
              accessibilityLabel={t("chatInput.structuredVoiceBeta")}
              accessibilityHint={
                !promptState.canChangePromptMode
                  ? t("chatInput.promptModeLockedDescription")
                  : promptMode === "structured"
                    ? t("chatInput.structuredVoiceOnDescription")
                    : t("chatInput.structuredVoiceOffDescription")
              }
              accessibilityState={{
                checked: promptMode === "structured",
                disabled: !canChangePromptMode,
                busy: isSwitchingPromptMode,
              }}
            >
              {isSwitchingPromptMode ? (
                <ActivityIndicator
                  size="small"
                  color={theme === "dark" ? "#c4b5fd" : "#7c3aed"}
                />
              ) : (
                <Sparkles
                  size={15}
                  color={
                    promptMode === "structured"
                      ? theme === "dark"
                        ? "#c4b5fd"
                        : "#7c3aed"
                      : colors.inkMuted
                  }
                />
              )}
              <Text
                style={[
                  s.promptModeText,
                  promptMode === "structured" && s.promptModeTextActive,
                ]}
              >
                {t("chatInput.structuredVoiceBeta")}
              </Text>
              <View
                style={[
                  s.promptModeDot,
                  promptMode === "structured" && s.promptModeDotActive,
                ]}
              />
            </Pressable>
          </View>
        )}
      </View>

      {/* Error */}
      {error && <Text style={s.errorText}>{error}</Text>}

      {/* Usage indicator */}
      {!isUnlimited &&
        msgLimit != null &&
        (isAtLimit ? (
          <Text style={s.limitReached}>
            {t("chatInput.dailyLimitReached", { limit: msgLimit.limit })}
          </Text>
        ) : (
          <Text style={[s.usage, usagePercent >= 0.8 && s.usageWarning]}>
            {t("chatInput.messagesUsage", {
              used: msgLimit.used,
              limit: msgLimit.limit,
            })}
          </Text>
        ))}

      {/* AI disclaimer (EU AI Act / Apple 5.1.2(i) disclosure) */}
      <Text style={s.aiDisclaimer}>
        {i18n.language === "es"
          ? "Synapse es IA. Puede equivocarse."
          : "Synapse is AI. It may be inaccurate."}
      </Text>
    </View>
  );
}
