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
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Map of Lucide icon names (stored in DB) → components.
 * These are the icons available in the EmojiPicker "Icons" tab.
 */
export const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
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

/** Check if a string is a Lucide icon name */
export function isLucideIcon(value: string): boolean {
  return value in LUCIDE_ICON_MAP;
}

/**
 * Renders a persona icon — either a Lucide icon (inside a tinted circle)
 * or an emoji (as plain text). Supports multiple sizes.
 */
export function PersonaIcon({
  icon,
  size = "md",
  className,
}: {
  icon: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const Icon = LUCIDE_ICON_MAP[icon];

  const sizeConfig = {
    sm: { container: "h-6 w-6", icon: "h-3.5 w-3.5", emoji: "text-lg" },
    md: { container: "h-8 w-8", icon: "h-4 w-4", emoji: "text-2xl" },
    lg: { container: "h-12 w-12", icon: "h-6 w-6", emoji: "text-4xl" },
    xl: { container: "h-14 w-14", icon: "h-7 w-7", emoji: "text-5xl" },
  }[size];

  if (Icon) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10",
          sizeConfig.container,
          className,
        )}
      >
        <Icon className={cn("text-primary", sizeConfig.icon)} />
      </div>
    );
  }

  return (
    <span className={cn(sizeConfig.emoji, className)} role="img" aria-hidden="true">
      {icon}
    </span>
  );
}
