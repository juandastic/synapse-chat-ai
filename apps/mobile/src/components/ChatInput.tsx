import { useState, useCallback, useRef, useMemo } from "react";
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
import { useUploadFile } from "@convex-dev/r2/react";
import { Send, ImagePlus, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { captureError } from "../lib/analytics";

import { useColors } from "../contexts/ThemeContext";
import { useChatContext } from "../contexts/useChatContext";
import { useStreamResponse } from "../hooks/useStreamResponse";
import { useImagePicker, PickedImage } from "../hooks/useImagePicker";

interface ChatInputProps {
  threadId: Id<"threads">;
}

export function ChatInput({ threadId }: ChatInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textInputRef = useRef<TextInput>(null);
  const colors = useColors();

  const { isGenerating, startStreaming } = useChatContext();
  const sendMessage = useMutation(api.messages.send);
  const uploadFile = useUploadFile(api.r2);
  const streamResponse = useStreamResponse();
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);
  const posthog = usePostHog();
  const { t, i18n } = useTranslation("chat");
  const insets = useSafeAreaInsets();

  const { images, pickImages, removeImage, clearImages, restoreImages, maxImages } = useImagePicker();

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();
    const hasImages = images.length > 0;

    if (!trimmedContent && !hasImages) return;
    if (isSubmitting || isGenerating) return;

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
        const uploadPromises = savedImages.map(async (img: PickedImage) => {
          const response = await fetch(img.uri);
          const blob = await response.blob();
          // R2's uploadWithProgress reads .type from the object and sends the body via XHR.
          // Blob.slice lets us set the correct MIME type. The File constructor may not
          // exist in Hermes, so we pass the typed blob directly — R2 only needs .type.
          const typedBlob = blob.type === img.mimeType
            ? blob
            : blob.slice(0, blob.size, img.mimeType);
          return uploadFile(typedBlob as unknown as File);
        });
        imageKeys = await Promise.all(uploadPromises);
        setIsUploading(false);
      }

      const result = await sendMessage({
        threadId,
        content: trimmedContent,
        ...(imageKeys && imageKeys.length > 0 ? { imageKeys } : {}),
      });

      posthog?.capture("message_sent_mobile", {
        thread_id: threadId,
        has_images: hasImages,
        image_count: savedImages.length,
      });

      startStreaming(result.assistantMessageId);
      void streamResponse(result.assistantMessageId, result.sessionId);
    } catch (err) {
      setContent(savedContent);
      restoreImages(savedImages);
      setIsUploading(false);
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      console.error("[ChatInput] Failed to send message:", err);
      captureError(err, { source: "chat_input", action: "send_message" });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    images,
    isSubmitting,
    isGenerating,
    sendMessage,
    uploadFile,
    threadId,
    startStreaming,
    streamResponse,
    clearImages,
    restoreImages,
  ]);

  // Usage limits
  const msgLimit = usageStatus?.dailyMessages;
  const isUnlimited = msgLimit?.limit === -1;
  const isAtLimit =
    !isUnlimited && msgLimit != null && msgLimit.used >= msgLimit.limit;
  const usagePercent =
    !isUnlimited && msgLimit ? msgLimit.used / msgLimit.limit : 0;

  const isDisabled = isSubmitting || isGenerating || isAtLimit;
  const canSubmit =
    (content.trim().length > 0 || images.length > 0) && !isDisabled;
  const canAttach = images.length < maxImages && !isDisabled;

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
          marginTop: 4,
          opacity: 0.7,
        },
      }),
    [colors]
  );

  return (
    <View style={[s.wrapper, { paddingBottom: insets.bottom + 4 }]}>
      <View style={s.container}>
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
            style={[s.sendButton, canSubmit ? s.sendButtonActive : s.sendButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityLabel={t("chatInput.sendMessage")}
          >
            {isUploading || isSubmitting || isGenerating ? (
              <ActivityIndicator size="small" color={canSubmit ? colors.primaryForeground : colors.inkMuted} />
            ) : (
              <Send
                size={18}
                color={canSubmit ? colors.primaryForeground : colors.inkMuted}
              />
            )}
          </Pressable>
        </View>
      </View>

      {/* Error */}
      {error && (
        <Text style={s.errorText}>{error}</Text>
      )}

      {/* Usage indicator */}
      {!isUnlimited && msgLimit != null && (
        isAtLimit ? (
          <Text style={s.limitReached}>
            {t("chatInput.dailyLimitReached", { limit: msgLimit.limit })}
          </Text>
        ) : (
          <Text style={[s.usage, usagePercent >= 0.8 && s.usageWarning]}>
            {t("chatInput.messagesUsage", { used: msgLimit.used, limit: msgLimit.limit })}
          </Text>
        )
      )}

      {/* AI disclaimer (EU AI Act / Apple 5.1.2(i) disclosure) */}
      <Text style={s.aiDisclaimer}>
        {i18n.language === "es"
          ? "Synapse es IA. Puede equivocarse."
          : "Synapse is AI. It may be inaccurate."}
      </Text>
    </View>
  );
}
