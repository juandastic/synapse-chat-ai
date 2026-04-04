import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Clock } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useColors } from "../contexts/ThemeContext";
import { formatSessionDate } from "../lib/format";

interface SessionDividerProps {
  timestamp: number;
}

export function SessionDivider({ timestamp }: SessionDividerProps) {
  const { i18n } = useTranslation();
  const colors = useColors();

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 16,
        },
        line: {
          flex: 1,
          height: 1,
          backgroundColor: colors.rule,
        },
        badge: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        },
        text: {
          fontSize: 11,
          color: colors.inkMuted,
        },
      }),
    [colors]
  );

  return (
    <View style={s.container}>
      <View style={s.line} />
      <View style={s.badge}>
        <Clock size={12} color={colors.inkMuted} />
        <Text style={s.text}>
          {formatSessionDate(timestamp, i18n.language)}
        </Text>
      </View>
      <View style={s.line} />
    </View>
  );
}
