import { memo, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { colors } from "../constants/colors";
import { PersonaIcon } from "./PersonaIcon";

interface ThreadListItemProps {
  threadId: string;
  title: string;
  personaIcon: string;
  lastMessageAt: number;
  onDelete: (threadId: string, title: string) => void;
  closeDrawer: () => void;
}

function formatRelativeTime(timestamp: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const months = Math.floor(diff / 2_592_000_000);

  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  if (days < 30) return t("time.daysAgo", { count: days });
  return t("time.monthsAgo", { count: months });
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

  const renderRightActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });
      return (
        <Pressable style={styles.deleteAction} onPress={handleDelete}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 size={20} color="#fff" />
          </Animated.View>
        </Pressable>
      );
    },
    [handleDelete]
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={handlePress}
      >
        <PersonaIcon icon={personaIcon} size="sm" />
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.time}>
            {formatRelativeTime(lastMessageAt, t)}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
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
});
