/**
 * IconBadge — A rounded square container for Lucide icons.
 *
 * Used on onboarding slides and persona headers to give each section
 * a consistent visual anchor. The icon receives the accent color
 * automatically so you only need to pass the icon component.
 *
 * Usage:
 *   <IconBadge icon={Brain} />
 */
import { View, StyleSheet } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "../constants/colors";

export function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <View style={styles.container}>
      <Icon size={28} color={colors.accent} strokeWidth={1.8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
});
