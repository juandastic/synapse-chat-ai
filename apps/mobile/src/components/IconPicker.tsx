import { useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import {
  Compass, Leaf, Zap, Heart, Brain, Sun, Moon, Star, Shield, Flame,
  Feather, Mountain, TreePine, Waves, Wind, Eye, Lightbulb, BookOpen,
  Pencil, Target, Rocket, Anchor, type LucideIcon,
} from "lucide-react-native";

import { useColors } from "../contexts/ThemeContext";
import { PersonaIcon } from "./PersonaIcon";
import { SlideUpModal } from "./SlideUpModal";

const LUCIDE_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "compass", Icon: Compass },
  { name: "leaf", Icon: Leaf },
  { name: "zap", Icon: Zap },
  { name: "heart", Icon: Heart },
  { name: "brain", Icon: Brain },
  { name: "sun", Icon: Sun },
  { name: "moon", Icon: Moon },
  { name: "star", Icon: Star },
  { name: "shield", Icon: Shield },
  { name: "flame", Icon: Flame },
  { name: "feather", Icon: Feather },
  { name: "mountain", Icon: Mountain },
  { name: "tree-pine", Icon: TreePine },
  { name: "waves", Icon: Waves },
  { name: "wind", Icon: Wind },
  { name: "eye", Icon: Eye },
  { name: "lightbulb", Icon: Lightbulb },
  { name: "book-open", Icon: BookOpen },
  { name: "pencil", Icon: Pencil },
  { name: "target", Icon: Target },
  { name: "rocket", Icon: Rocket },
  { name: "anchor", Icon: Anchor },
];

const EMOJI_CATEGORIES = [
  {
    id: "people",
    label: "People",
    emojis: [
      "\u{1F9E0}", "\u{1F916}", "\u{1F464}", "\u{1F9D1}\u200D\u{1F4BB}", "\u{1F468}\u200D\u{1F52C}", "\u{1F469}\u200D\u{1F393}", "\u{1F9D9}", "\u{1F9D1}\u200D\u{1F3EB}",
      "\u{1F468}\u200D\u2695\uFE0F", "\u{1F469}\u200D\u{1F373}", "\u{1F9D1}\u200D\u{1F3A8}", "\u{1F468}\u200D\u{1F680}", "\u{1F977}", "\u{1F9B8}", "\u{1F9DD}", "\u{1F9D1}\u200D\u{1F527}",
      "\u{1F60A}", "\u{1F604}", "\u{1F60E}", "\u{1F913}", "\u{1F9D0}", "\u{1F914}", "\u{1F917}", "\u{1F607}",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      "\u{1F4DA}", "\u{1F4A1}", "\u{1F52C}", "\u{1F3AF}", "\u{1F527}", "\u{1F4BB}", "\u{1F4DD}", "\u{1F5C2}\uFE0F",
      "\u{1F3A8}", "\u{1F3B5}", "\u{1F3AC}", "\u{1F4F7}", "\u{1F511}", "\u{1F48A}", "\u{1F9EA}", "\u{1F4E1}",
      "\u{1F3C6}", "\u{1F393}", "\u{1F4BC}", "\u{1F4CA}", "\u{1F5FA}\uFE0F", "\u{1F9ED}", "\u2699\uFE0F", "\u{1F6E1}\uFE0F",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "\u{1F331}", "\u{1F989}", "\u{1F431}", "\u{1F30A}", "\u{1F338}", "\u{1F343}", "\u{1F43A}", "\u{1F98B}",
      "\u{1F319}", "\u2600\uFE0F", "\u{1F308}", "\u{1F525}", "\u2744\uFE0F", "\u{1F409}", "\u{1F98A}", "\u{1F43B}",
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    emojis: [
      "\u2728", "\u{1F49C}", "\u2B50", "\u{1F52E}", "\u{1F4AC}", "\u2764\uFE0F", "\u267E\uFE0F", "\u26A1",
      "\u{1F300}", "\u{1F48E}", "\u{1FAE7}", "\u262F\uFE0F", "\u{1F3B2}", "\u{1F9FF}", "\u{1FAAC}", "\u{1F4AB}",
    ],
  },
] as const;

type CategoryId = "icons" | "people" | "objects" | "nature" | "symbols";

const TABS: { id: CategoryId; label: string }[] = [
  { id: "icons", label: "Icons" },
  { id: "people", label: "People" },
  { id: "objects", label: "Objects" },
  { id: "nature", label: "Nature" },
  { id: "symbols", label: "Symbols" },
];

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CategoryId>("icons");
  const colors = useColors();

  const handleSelect = useCallback(
    (icon: string) => {
      onChange(icon);
      setIsOpen(false);
    },
    [onChange]
  );

  const currentEmojis = EMOJI_CATEGORIES.find((c) => c.id === activeTab)?.emojis;

  const s = useMemo(
    () =>
      StyleSheet.create({
        trigger: {
          width: 64,
          height: 64,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        },
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.3)",
        },
        sheet: {
          backgroundColor: colors.paper,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 32,
          maxHeight: "60%",
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.rule,
          alignSelf: "center",
          marginTop: 10,
          marginBottom: 12,
        },
        tabBar: {
          maxHeight: 40,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
        },
        tabBarContent: {
          paddingHorizontal: 12,
          gap: 4,
        },
        tab: {
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        tabActive: {
          borderBottomWidth: 2,
          borderBottomColor: colors.primary,
        },
        tabText: {
          fontSize: 13,
          fontWeight: "500",
          color: colors.inkMuted,
        },
        tabTextActive: {
          color: colors.primary,
          fontWeight: "600",
        },
        grid: {
          flexDirection: "row",
          flexWrap: "wrap",
          padding: 12,
          gap: 6,
        },
        cell: {
          width: 44,
          height: 44,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
        },
        cellSelected: {
          backgroundColor: colors.accentLight,
          borderWidth: 1,
          borderColor: colors.accent,
        },
        emoji: {
          fontSize: 22,
        },
      }),
    [colors]
  );

  return (
    <>
      {/* Trigger */}
      <Pressable style={s.trigger} onPress={() => setIsOpen(true)}>
        <PersonaIcon icon={value} size="lg" />
      </Pressable>

      {/* Picker modal */}
      <SlideUpModal visible={isOpen} onRequestClose={() => setIsOpen(false)} onBackdropPress={() => setIsOpen(false)}>
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                style={[s.tab, activeTab === tab.id && s.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Grid */}
          <ScrollView contentContainerStyle={s.grid}>
            {activeTab === "icons"
              ? LUCIDE_ICONS.map(({ name, Icon }) => (
                  <Pressable
                    key={name}
                    style={[s.cell, value === name && s.cellSelected]}
                    onPress={() => handleSelect(name)}
                  >
                    <Icon size={20} color={value === name ? colors.primary : colors.inkMuted} />
                  </Pressable>
                ))
              : currentEmojis?.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={[s.cell, value === emoji && s.cellSelected]}
                    onPress={() => handleSelect(emoji)}
                  >
                    <Text style={s.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
          </ScrollView>
        </View>
      </SlideUpModal>
    </>
  );
}
