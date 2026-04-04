import { memo, useCallback, useRef, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import type { Doc } from "@synapse/backend/dataModel";
import Markdown from "react-native-markdown-display";

import { colors } from "../constants/colors";
import { formatMessageTime } from "../lib/format";
import { MessageImage } from "./MessageImage";

interface MessageItemProps {
  message: Doc<"messages">;
  isStreaming?: boolean;
  onLongPress?: (message: Doc<"messages">) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  onLongPress,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isError = message.type === "error";
  const isEmpty = message.content === "";
  const hasImages =
    isUser && message.imageKeys !== undefined && message.imageKeys.length > 0;
  const { i18n } = useTranslation();

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(message);
  }, [message, onLongPress]);

  const markdownStyles = useMemo(
    () => ({
      body: {
        fontSize: 15,
        lineHeight: 22,
        color: colors.ink,
      },
      heading1: { fontSize: 20, fontWeight: "700" as const, color: colors.ink, marginBottom: 8 },
      heading2: { fontSize: 18, fontWeight: "600" as const, color: colors.ink, marginBottom: 6 },
      heading3: { fontSize: 16, fontWeight: "600" as const, color: colors.ink, marginBottom: 4 },
      paragraph: { marginBottom: 8 },
      link: { color: colors.primary },
      code_inline: {
        fontSize: 14,
        backgroundColor: colors.accentLight,
        paddingHorizontal: 4,
        borderRadius: 4,
        color: colors.ink,
      },
      code_block: {
        fontSize: 14,
        backgroundColor: colors.accentLight,
        padding: 12,
        borderRadius: 8,
        color: colors.ink,
      },
      fence: {
        fontSize: 14,
        backgroundColor: colors.accentLight,
        padding: 12,
        borderRadius: 8,
        color: colors.ink,
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: colors.accent,
        paddingLeft: 12,
        marginLeft: 0,
        opacity: 0.8,
      },
      list_item: { marginBottom: 4 },
      strong: { fontWeight: "600" as const },
    }),
    []
  );

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={300}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? styles.bubbleUser
            : isError
              ? styles.bubbleError
              : styles.bubbleAssistant,
        ]}
      >
        {/* Images */}
        {hasImages && (
          <View
            style={[
              styles.imageGrid,
              message.imageKeys!.length === 1
                ? styles.imageGridSingle
                : styles.imageGridDouble,
            ]}
          >
            {message.imageKeys!.map((key) => (
              <MessageImage key={key} imageKey={key} />
            ))}
          </View>
        )}

        {/* Content */}
        {isEmpty && isStreaming ? (
          <View style={styles.dotsRow}>
            <PulsingDot delay={0} />
            <PulsingDot delay={200} />
            <PulsingDot delay={400} />
          </View>
        ) : isEmpty && hasImages ? null : isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>
            {message.content || ""}
          </Markdown>
        )}

        {/* Error indicator */}
        {isError && (
          <Text style={styles.errorHint}>Error</Text>
        )}
      </View>

      {/* Timestamp */}
      {(!isEmpty || hasImages) && (
        <Text
          style={[
            styles.timestamp,
            isUser ? styles.timestampUser : styles.timestampAssistant,
          ]}
        >
          {formatMessageTime(message._creationTime, i18n.language)}
        </Text>
      )}
    </Pressable>
  );
});

function PulsingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, delay]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 2,
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.ink,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  bubbleError: {
    backgroundColor: "rgba(192, 57, 43, 0.08)",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(192, 57, 43, 0.2)",
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.paper,
  },
  errorHint: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
    opacity: 0.7,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  timestampUser: {
    color: "rgba(107, 94, 79, 0.5)",
    textAlign: "right",
  },
  timestampAssistant: {
    color: "rgba(107, 94, 79, 0.5)",
    textAlign: "left",
  },
  imageGrid: {
    marginBottom: 6,
    gap: 4,
  },
  imageGridSingle: {},
  imageGridDouble: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inkMuted,
  },
});
