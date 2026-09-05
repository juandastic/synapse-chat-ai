import { getRelativeTime } from "../lib/format";
import { memo, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "../contexts/ThemeContext";
import { PersonaIcon } from "./PersonaIcon";

interface ThreadListItemProps {
  threadId: string;
  title: string;
  personaIcon: string;
  lastMessageAt: number;
  onDelete: (threadId: string, title: string) => void;
  closeDrawer: () => void;
}

export const ThreadListItem = memo(function ThreadListItem({
  threadId,
  title,
  personaIcon,
  lastMessageAt,
  onDelete,
  closeDrawer,
}: ThreadListItemProps) {
  const router = useRouter();
  const { t } = useTranslation("sidebar");
  const colors = useColors();
  const swipeableRef = useRef<Swipeable>(null);

  const handlePress = useCallback(() => {
    closeDrawer();
    router.push(`/(home)/${threadId}` as never);
  }, [router, threadId, closeDrawer]);

  const handleDelete = useCallback(() => {
    swipeableRef.current?.close();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t("deleteThreadTitle", { title }),
      t("deleteThreadDescription"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteThread"),
          style: "destructive",
          onPress: () => onDelete(threadId, title),
        },
      ]
    );
  }, [threadId, title, onDelete, t]);

  const s = useMemo(
    () =>
      StyleSheet.create({
        item: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 10,
          paddingHorizontal: 16,
          backgroundColor: colors.paper,
        },
        itemPressed: {
          backgroundColor: colors.accentLight,
        },
        content: {
          flex: 1,
        },
        title: {
          fontSize: 14,
          fontWeight: "500",
          color: colors.ink,
        },
        time: {
          fontSize: 12,
          color: colors.inkMuted,
          marginTop: 2,
        },
        deleteAction: {
          backgroundColor: colors.error,
          justifyContent: "center",
          alignItems: "center",
          width: 72,
        },
      }),
    [colors]
  );

  const renderRightActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });
      return (
        <Pressable style={s.deleteAction} onPress={handleDelete}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 size={20} color={colors.white} />
          </Animated.View>
        </Pressable>
      );
    },
    [handleDelete, s, colors]
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        style={({ pressed }) => [s.item, pressed && s.itemPressed]}
        onPress={handlePress}
      >
        <PersonaIcon icon={personaIcon} size="sm" />
        <View style={s.content}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.time}>
            {getRelativeTime(lastMessageAt, t)}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
});
