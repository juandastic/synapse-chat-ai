import {
  memo,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import type { Doc } from "@synapse/backend/dataModel";
import Markdown from "react-native-markdown-display";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { MoreHorizontal } from "lucide-react-native";

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
      ]),
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
    [colors],
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
  isLast?: boolean;
  onActionsPress?: (message: Doc<"messages">) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  isLast = false,
  onActionsPress,
}: MessageItemProps) {
  const colors = useColors();
  const isUser = message.role === "user";
  const isError = message.type === "error";
  const isEmpty = message.content === "";
  const hasImages =
    isUser && message.imageKeys !== undefined && message.imageKeys.length > 0;
  const { t, i18n } = useTranslation("chat");

  const handleActionsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onActionsPress?.(message);
  }, [message, onActionsPress]);

  const markdownStyles = useMemo(
    () => ({
      body: {
        fontSize: 15,
        lineHeight: 22,
        color: colors.ink,
      },
      heading1: {
        fontSize: 20,
        fontWeight: "700" as const,
        color: colors.ink,
        marginBottom: 8,
      },
      heading2: {
        fontSize: 18,
        fontWeight: "600" as const,
        color: colors.ink,
        marginBottom: 6,
      },
      heading3: {
        fontSize: 16,
        fontWeight: "600" as const,
        color: colors.ink,
        marginBottom: 4,
      },
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
    [colors],
  );

  const markdownRules = useMemo<RenderRules>(
    () => ({
      textgroup: (
        node: ASTNode,
        children: ReactNode[],
        _parentNodes: ASTNode[],
        styles: any,
      ) => (
        <Text
          key={node.key}
          style={styles.textgroup}
          selectable
          selectionColor={colors.accent}
        >
          {children}
        </Text>
      ),
      code_block: renderSelectableCodeBlock,
      fence: renderSelectableCodeBlock,
    }),
    [colors.accent],
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
          backgroundColor: colors.primary,
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
          color: colors.primaryForeground,
        },
        errorHint: {
          fontSize: 12,
          color: colors.error,
          marginTop: 4,
          opacity: 0.7,
        },
        timestamp: {
          fontSize: 11,
        },
        timestampUser: {
          color: colors.inkMuted,
          textAlign: "right",
        },
        timestampAssistant: {
          color: colors.inkMuted,
          textAlign: "left",
        },
        metaRow: {
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          marginTop: 2,
          paddingHorizontal: 4,
        },
        metaRowUser: {
          alignSelf: "flex-end",
        },
        metaRowAssistant: {
          alignSelf: "flex-start",
        },
        actionsButton: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
        },
        actionsButtonPressed: {
          backgroundColor: colors.accentLight,
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
    [colors],
  );

  const bubbleContent = (
    <>
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
        <Markdown style={markdownStyles} rules={markdownRules}>
          {message.content || ""}
        </Markdown>
      )}

      {/* Error indicator */}
      {isError && <Text style={s.errorHint}>Error</Text>}
    </>
  );

  return (
    <View style={[s.row, isUser ? s.rowUser : s.rowAssistant]}>
      {isUser ? (
        <Pressable
          onLongPress={handleActionsPress}
          delayLongPress={300}
          style={[s.bubble, s.bubbleUser]}
        >
          {bubbleContent}
        </Pressable>
      ) : (
        <View style={[s.bubble, isError ? s.bubbleError : s.bubbleAssistant]}>
          {bubbleContent}
        </View>
      )}

      {/* RAG recall badge — only on last assistant message */}
      {isLast && !isUser && message.metadata?.ragEnabled && (
        <RagBadge
          count={
            (message.metadata.ragNodes ?? 0) + (message.metadata.ragEdges ?? 0)
          }
          colors={colors}
        />
      )}

      {/* Timestamp */}
      {(!isEmpty || hasImages) && (
        <View style={[s.metaRow, isUser ? s.metaRowUser : s.metaRowAssistant]}>
          <Text
            style={[
              s.timestamp,
              isUser ? s.timestampUser : s.timestampAssistant,
            ]}
          >
            {formatMessageTime(message._creationTime, i18n.language)}
          </Text>
          {!isUser && !isStreaming && onActionsPress && (
            <Pressable
              onPress={handleActionsPress}
              hitSlop={8}
              style={({ pressed }) => [
                s.actionsButton,
                pressed && s.actionsButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("messageItem.moreActions")}
            >
              <MoreHorizontal size={16} color={colors.inkMuted} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
});

function renderSelectableCodeBlock(
  node: ASTNode,
  _children: ReactNode[],
  _parentNodes: ASTNode[],
  styles: any,
  inheritedStyles: any = {},
) {
  const content = node.content.endsWith("\n")
    ? node.content.slice(0, -1)
    : node.content;

  return (
    <Text
      key={node.key}
      style={[inheritedStyles, styles[node.type]]}
      selectable
    >
      {content}
    </Text>
  );
}

function RagBadge({ count, colors }: { count: number; colors: any }) {
  const { t } = useTranslation("chat");
  if (count === 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 4,
        paddingHorizontal: 4,
      }}
    >
      <Text style={{ fontSize: 11, color: colors.inkMuted, opacity: 0.5 }}>
        ✦ {t("ragBadge.memoriesRecalled", { count })}
      </Text>
    </View>
  );
}

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
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, delay]);

  return <Animated.View style={[dotStyle, { opacity }]} />;
}
