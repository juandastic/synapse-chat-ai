import { View, Text, StyleSheet } from "react-native";
import {
  Compass,
  Leaf,
  Zap,
  Heart,
  Brain,
  Sun,
  Moon,
  Star,
  Shield,
  Flame,
  Feather,
  Mountain,
  TreePine,
  Waves,
  Wind,
  Eye,
  Lightbulb,
  BookOpen,
  Pencil,
  Target,
  Rocket,
  Anchor,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "../constants/colors";

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  compass: Compass,
  leaf: Leaf,
  zap: Zap,
  heart: Heart,
  brain: Brain,
  sun: Sun,
  moon: Moon,
  star: Star,
  shield: Shield,
  flame: Flame,
  feather: Feather,
  mountain: Mountain,
  "tree-pine": TreePine,
  waves: Waves,
  wind: Wind,
  eye: Eye,
  lightbulb: Lightbulb,
  "book-open": BookOpen,
  pencil: Pencil,
  target: Target,
  rocket: Rocket,
  anchor: Anchor,
};

const SIZE_CONFIG = {
  sm: { container: 24, icon: 14, emoji: 18 },
  md: { container: 32, icon: 16, emoji: 24 },
  lg: { container: 48, icon: 24, emoji: 36 },
  xl: { container: 56, icon: 28, emoji: 44 },
} as const;

interface PersonaIconProps {
  icon: string;
  size?: keyof typeof SIZE_CONFIG;
}

export function PersonaIcon({ icon, size = "md" }: PersonaIconProps) {
  const config = SIZE_CONFIG[size];
  const Icon = LUCIDE_ICON_MAP[icon];

  if (Icon) {
    return (
      <View
        style={[
          styles.container,
          {
            width: config.container,
            height: config.container,
            borderRadius: config.container / 2,
          },
        ]}
      >
        <Icon size={config.icon} color={colors.primary} />
      </View>
    );
  }

  return (
    <Text style={{ fontSize: config.emoji }}>{icon}</Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139, 94, 60, 0.1)",
  },
});
