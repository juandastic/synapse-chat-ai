/**
 * UseCase — A single "perfect for" item with a checkmark icon.
 * Used on persona slides to list key use cases.
 */
import { View, Text, StyleSheet } from "react-native";
import { CheckCircle } from "lucide-react-native";
import { colors } from "../constants/colors";

export function UseCase({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <CheckCircle size={14} color={colors.accent} strokeWidth={2} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
