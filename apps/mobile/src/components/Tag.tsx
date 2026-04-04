/**
 * Tag — A small pill-shaped label, used to display theory names
 * on persona slides (e.g. "ACT", "DBT", "PERMA Model").
 */
import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../contexts/ThemeContext";

export function Tag({ label }: { label: string }) {
  const colors = useColors();

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.accentLight,
          borderWidth: 1,
          borderColor: colors.rule,
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 6,
        },
        text: {
          fontSize: 12,
          fontWeight: "600",
          color: colors.accent,
        },
      }),
    [colors]
  );

  return (
    <View style={s.container}>
      <Text style={s.text}>{label}</Text>
    </View>
  );
}
