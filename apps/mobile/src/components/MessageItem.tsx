import { memo, useCallback, useRef, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import type { Doc } from "@synapse/backend/dataModel";
import Markdown from "react-native-markdown-display";

import { useColors } from "../contexts/ThemeContext";
import { formatMessageTime } from "../lib/format";
import { MessageImage } from "./MessageImage";

/**
 * Renders streaming text as plain Text for performance.
 * Markdown re-parses the entire tree on every update which causes jank.
 * Plain Text updates are nearly free and give a smooth token-by-token feel.
 * A blinking cursor is appended to indicate active streaming.
 */
const StreamingText = memo(function StreamingText({
  content,
}: {
  content: string;
}) {
  const colors = useColors();
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  const streamingS = useMemo(
    () =>
      StyleSheet.create({
        body: {
          fontSize: 15,
          lineHeight: 22,
          color: colors.ink,
        },
        cursor: {
          fontSize: 15,
          color: colors.accent,
          fontWeight: "300",
        },
      }),
    [colors]
  );

  return (
    <Text style={streamingS.body}>
      {content}
      <Animated.View style={{ opacity: cursorOpacity }}>
        <Text style={streamingS.cursor}>▎</Text>
      </Animated.View>
    </Text>
  );
});

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
  const colors = useColors();
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
    [colors]
  );

  const s = useMemo(
    () =>
      StyleSheet.create({
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
          backgroundColor: colors.errorLight,
          borderBottomLeftRadius: 4,
          borderWidth: 1,
          borderColor: colors.errorLight,
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
          color: colors.inkMuted,
          textAlign: "right",
        },
        timestampAssistant: {
          color: colors.inkMuted,
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
      }),
    [colors]
  );

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={300}
      style={[s.row, isUser ? s.rowUser : s.rowAssistant]}
    >
      <View
        style={[
          s.bubble,
          isUser
            ? s.bubbleUser
            : isError
              ? s.bubbleError
              : s.bubbleAssistant,
        ]}
      >
        {/* Images */}
        {hasImages && (
          <View
            style={[
              s.imageGrid,
              message.imageKeys!.length === 1
                ? s.imageGridSingle
                : s.imageGridDouble,
            ]}
          >
            {message.imageKeys!.map((key) => (
              <MessageImage key={key} imageKey={key} />
            ))}
          </View>
        )}

        {/* Content */}
        {isEmpty && isStreaming ? (
          <View style={s.dotsRow}>
            <PulsingDot delay={0} dotStyle={s.dot} />
            <PulsingDot delay={200} dotStyle={s.dot} />
            <PulsingDot delay={400} dotStyle={s.dot} />
          </View>
        ) : isEmpty && hasImages ? null : isUser ? (
          <Text style={s.userText}>{message.content}</Text>
        ) : isStreaming ? (
          <StreamingText content={message.content || ""} />
        ) : (
          <Markdown style={markdownStyles}>
            {message.content || ""}
          </Markdown>
        )}

        {/* Error indicator */}
        {isError && (
          <Text style={s.errorHint}>Error</Text>
        )}
      </View>

      {/* Timestamp */}
      {(!isEmpty || hasImages) && (
        <Text
          style={[
            s.timestamp,
            isUser ? s.timestampUser : s.timestampAssistant,
          ]}
        >
          {formatMessageTime(message._creationTime, i18n.language)}
        </Text>
      )}
    </Pressable>
  );
});

function PulsingDot({ delay, dotStyle }: { delay: number; dotStyle: object }) {
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

  return <Animated.View style={[dotStyle, { opacity }]} />;
}
