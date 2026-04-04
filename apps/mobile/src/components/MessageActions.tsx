import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation } from "convex/react";
import { api } from "@synapse/backend/api";
import { Doc } from "@synapse/backend/dataModel";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Copy, RotateCcw, Trash2 } from "lucide-react-native";

import { useColors } from "../contexts/ThemeContext";
import { useChatContext } from "../contexts/useChatContext";
import { useStreamResponse } from "../hooks/useStreamResponse";

interface MessageActionsProps {
  message: Doc<"messages">;
  onClose: () => void;
}

export function MessageActions({ message, onClose }: MessageActionsProps) {
  const { t } = useTranslation("chat");
  const colors = useColors();
  const isUser = message.role === "user";
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const resendMessage = useMutation(api.messages.resend);
  const { isGenerating, startStreaming } = useChatContext();
  const streamResponse = useStreamResponse();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(message.content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [message.content, onClose]);

  const handleRetry = useCallback(async () => {
    if (isRetrying || isGenerating) return;
    setIsRetrying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    try {
      const result = await resendMessage({ userMessageId: message._id });
      startStreaming(result.assistantMessageId);
      void streamResponse(result.assistantMessageId, result.sessionId);
    } catch (err) {
      console.error("[MessageActions] Failed to retry:", err);
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, isGenerating, resendMessage, message._id, startStreaming, streamResponse, onClose]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    Alert.alert(
      t("messageItem.confirmDeleteTitle"),
      t("messageItem.confirmDeleteDescription"),
      [
        { text: t("messageItem.cancel"), style: "cancel" },
        {
          text: t("messageItem.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMessage({ messageId: message._id });
            } catch (err) {
              console.error("[MessageActions] Failed to delete:", err);
            }
          },
        },
      ]
    );
  }, [deleteMessage, message._id, onClose, t]);

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: 16,
          paddingBottom: 16,
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.rule,
          alignSelf: "center",
          marginBottom: 16,
        },
        actionRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 14,
          paddingHorizontal: 8,
          borderRadius: 10,
        },
        actionRowPressed: {
          backgroundColor: colors.accentLight,
        },
        actionRowDisabled: {
          opacity: 0.4,
        },
        actionLabel: {
          fontSize: 16,
          color: colors.ink,
        },
        actionLabelDestructive: {
          color: colors.error,
        },
        separator: {
          height: 1,
          backgroundColor: colors.rule,
          marginVertical: 4,
        },
      }),
    [colors]
  );

  return (
    <View style={s.container}>
      <View style={s.handle} />

      {message.content.length > 0 && (
        <ActionRow icon={Copy} label={t("messageItem.copy")} onPress={handleCopy} colors={colors} s={s} />
      )}

      {isUser && (
        <ActionRow
          icon={RotateCcw}
          label={t("messageItem.retry")}
          onPress={handleRetry}
          disabled={isRetrying || isGenerating}
          colors={colors}
          s={s}
        />
      )}

      <View style={s.separator} />

      <ActionRow
        icon={Trash2}
        label={t("messageItem.delete")}
        onPress={handleDelete}
        destructive
        colors={colors}
        s={s}
      />
    </View>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onPress,
  destructive = false,
  disabled = false,
  colors,
  s,
}: {
  icon: typeof Copy;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  colors: ReturnType<typeof useColors>;
  s: Record<string, object>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.actionRow,
        pressed && s.actionRowPressed,
        disabled && s.actionRowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Icon size={20} color={destructive ? colors.error : colors.ink} />
      <Text style={[s.actionLabel, destructive && s.actionLabelDestructive]}>
        {label}
      </Text>
    </Pressable>
  );
}
