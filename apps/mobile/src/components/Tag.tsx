/**
 * Tag — A small pill-shaped label, used to display theory names
 * on persona slides (e.g. "ACT", "DBT", "PERMA Model").
 */
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../constants/colors";

export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
