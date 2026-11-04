import { View } from "react-native";
import { Mic } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";

export function AudioLevelIndicator({ level }: { level: number | null }) {
  const { t } = useTranslation("chat");
  const { colors } = useTheme();
  const value = level ?? 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("voice.inputLevel")}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: level === null ? undefined : Math.round(level * 100),
        text: t(
          level === null
            ? "voice.levelUnavailable"
            : value > 0
              ? "voice.soundDetected"
              : "voice.noSound",
        ),
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginRight: 8,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.primary,
            opacity: 0.08 + value * 0.12,
            transform: [{ scale: 1 + value * 0.2 }],
          }}
        />
        <Mic size={16} color={colors.primary} />
      </View>
      <View
        style={{
          height: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
        }}
      >
        {[0.5, 0.75, 1, 0.75, 0.5].map((weight, index) => (
          <View
            key={index}
            style={{
              width: 2,
              height: 4 + value * weight * 20,
              borderRadius: 1,
              backgroundColor: colors.primary,
              opacity: 0.35 + value * 0.65,
            }}
          />
        ))}
      </View>
    </View>
  );
}
