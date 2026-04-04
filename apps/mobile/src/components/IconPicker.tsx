import { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Modal } from "react-native";
import {
  Compass, Leaf, Zap, Heart, Brain, Sun, Moon, Star, Shield, Flame,
  Feather, Mountain, TreePine, Waves, Wind, Eye, Lightbulb, BookOpen,
  Pencil, Target, Rocket, Anchor, type LucideIcon,
} from "lucide-react-native";

import { colors } from "../constants/colors";
import { PersonaIcon } from "./PersonaIcon";

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
      "🧠", "🤖", "👤", "🧑‍💻", "👨‍🔬", "👩‍🎓", "🧙", "🧑‍🏫",
      "👨‍⚕️", "👩‍🍳", "🧑‍🎨", "👨‍🚀", "🥷", "🦸", "🧝", "🧑‍🔧",
      "😊", "😄", "😎", "🤓", "🧐", "🤔", "🤗", "😇",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      "📚", "💡", "🔬", "🎯", "🔧", "💻", "📝", "🗂️",
      "🎨", "🎵", "🎬", "📷", "🔑", "💊", "🧪", "📡",
      "🏆", "🎓", "💼", "📊", "🗺️", "🧭", "⚙️", "🛡️",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "🌱", "🦉", "🐱", "🌊", "🌸", "🍃", "🐺", "🦋",
      "🌙", "☀️", "🌈", "🔥", "❄️", "🐉", "🦊", "🐻",
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    emojis: [
      "✨", "💜", "⭐", "🔮", "💬", "❤️", "♾️", "⚡",
      "🌀", "💎", "🫧", "☯️", "🎲", "🧿", "🪬", "💫",
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

  const handleSelect = useCallback(
    (icon: string) => {
      onChange(icon);
      setIsOpen(false);
    },
    [onChange]
  );

  const currentEmojis = EMOJI_CATEGORIES.find((c) => c.id === activeTab)?.emojis;

  return (
    <>
      {/* Trigger */}
      <Pressable style={styles.trigger} onPress={() => setIsOpen(true)}>
        <PersonaIcon icon={value} size="lg" />
      </Pressable>

      {/* Picker modal */}
      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Grid */}
          <ScrollView contentContainerStyle={styles.grid}>
            {activeTab === "icons"
              ? LUCIDE_ICONS.map(({ name, Icon }) => (
                  <Pressable
                    key={name}
                    style={[styles.cell, value === name && styles.cellSelected]}
                    onPress={() => handleSelect(name)}
                  >
                    <Icon size={20} color={value === name ? colors.primary : colors.inkMuted} />
                  </Pressable>
                ))
              : currentEmojis?.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={[styles.cell, value === emoji && styles.cellSelected]}
                    onPress={() => handleSelect(emoji)}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(139, 94, 60, 0.12)",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  emoji: {
    fontSize: 22,
  },
});
