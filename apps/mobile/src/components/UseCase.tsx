/**
 * UseCase — A single "perfect for" item with a checkmark icon.
 * Used on persona slides to list key use cases.
 */
import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CheckCircle } from "lucide-react-native";
import { useColors } from "../contexts/ThemeContext";

export function UseCase({ text }: { text: string }) {
  const colors = useColors();

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
        },
        text: {
          flex: 1,
          fontSize: 14,
          lineHeight: 20,
          color: colors.inkMuted,
        },
      }),
    [colors]
  );

  return (
    <View style={s.container}>
      <CheckCircle size={14} color={colors.accent} strokeWidth={2} />
      <Text style={s.text}>{text}</Text>
    </View>
  );
}
