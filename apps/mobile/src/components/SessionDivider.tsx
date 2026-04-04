import { View, Text, StyleSheet } from "react-native";
import { Clock } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { colors } from "../constants/colors";
import { formatSessionDate } from "../lib/format";

interface SessionDividerProps {
  timestamp: number;
}

export function SessionDivider({ timestamp }: SessionDividerProps) {
  const { i18n } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={styles.badge}>
        <Clock size={12} color={colors.inkMuted} />
        <Text style={styles.text}>
          {formatSessionDate(timestamp, i18n.language)}
        </Text>
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
