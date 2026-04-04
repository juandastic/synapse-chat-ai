/**
 * ChatBubble — A styled message bubble used in the onboarding
 * comparison section to show the difference between a regular AI
 * and Synapse's contextual responses.
 *
 * - `role: "user"` renders right-aligned dark bubble
 * - `role: "ai"` renders left-aligned light bubble
 * - `muted: true` reduces opacity (used for the "regular AI" example)
 */
import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../contexts/ThemeContext";

interface ChatBubbleProps {
  role: "user" | "ai";
  text: string;
  /** When true, renders at reduced opacity (for the "regular AI" comparison) */
  muted?: boolean;
}

export function ChatBubble({ role, text, muted }: ChatBubbleProps) {
  const colors = useColors();
  const isUser = role === "user";

  const s = useMemo(
    () =>
      StyleSheet.create({
        bubble: {
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          maxWidth: "88%",
        },
        bubbleUser: {
          backgroundColor: colors.ink,
          alignSelf: "flex-end",
          borderBottomRightRadius: 4,
        },
        bubbleAI: {
          backgroundColor: colors.white,
          alignSelf: "flex-start",
          borderBottomLeftRadius: 4,
          borderWidth: 1,
          borderColor: colors.rule,
        },
        bubbleMuted: {
          opacity: 0.55,
        },
        text: {
          fontSize: 13,
          lineHeight: 19,
          color: colors.ink,
        },
        textUser: {
          color: colors.paper,
        },
      }),
    [colors]
  );

  return (
    <View
      style={[
        s.bubble,
        isUser ? s.bubbleUser : s.bubbleAI,
        muted && s.bubbleMuted,
      ]}
    >
      <Text style={[s.text, isUser && s.textUser]}>{text}</Text>
    </View>
  );
}
