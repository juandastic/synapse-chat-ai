import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { DrawerContentComponentProps } from "expo-router/drawer";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Plus, Brain, Settings, Database, CreditCard, Globe, Sun, Moon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors, useTheme } from "../contexts/ThemeContext";
import { ThreadListItem } from "./ThreadListItem";

export function ThreadList({ navigation }: DrawerContentComponentProps) {
  const rawThreads = useQuery(api.threads.list);
  const personas = useQuery(api.personas.list);
  const removeThread = useMutation(api.threads.remove);

  // Frontend persona join — personas.list is shared with the home screen
  const threads = useMemo(() => {
    if (!rawThreads) return rawThreads; // preserve undefined for loading state
    const personaMap = new Map(
      (personas ?? []).map((p) => [p._id, { name: p.name, icon: p.icon }])
    );
    return rawThreads.map((thread) => ({
      ...thread,
      persona: personaMap.get(thread.personaId) ?? { name: "Unknown", icon: "❓" },
    }));
  }, [rawThreads, personas]);
  const router = useRouter();
  const { user } = useUser();
  const { t, i18n } = useTranslation("sidebar");
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { theme, toggleTheme } = useTheme();

  const closeDrawer = useCallback(() => {
    navigation.closeDrawer();
  }, [navigation]);

  const handleNewChat = useCallback(() => {
    closeDrawer();
    router.push("/(home)/" as never);
  }, [router, closeDrawer]);

  const handleDelete = useCallback(
    async (threadId: string, _title: string) => {
      try {
        await removeThread({ threadId: threadId as Id<"threads"> });
      } catch {
        // Mutation validates ownership
      }
    },
    [removeThread]
  );

  const toggleLanguage = useCallback(() => {
    i18n.changeLanguage(i18n.language === "es" ? "en" : "es");
  }, [i18n]);

  const initials =
    user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ??
    "?";

  const renderItem = useCallback(
    ({ item }: { item: NonNullable<typeof threads>[number] }) => (
      <ThreadListItem
        threadId={item._id}
        title={item.title}
        personaIcon={item.persona.icon}
        lastMessageAt={item.lastMessageAt}
        onDelete={handleDelete}
        closeDrawer={closeDrawer}
      />
    ),
    [handleDelete, closeDrawer]
  );

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
        },
        header: {
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        logoRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        logoCircle: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.accentLight,
          alignItems: "center",
          justifyContent: "center",
        },
        logoText: {
          fontSize: 16,
          fontWeight: "700",
          color: colors.accent,
        },
        appName: {
          fontSize: 16,
          fontWeight: "700",
          color: colors.ink,
          letterSpacing: -0.3,
        },
        actions: {
          paddingHorizontal: 8,
          paddingBottom: 8,
          gap: 2,
        },
        actionButton: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 12,
        },
        actionPressed: {
          backgroundColor: colors.accentLight,
        },
        actionLabel: {
          fontSize: 14,
          color: colors.inkMuted,
        },
        divider: {
          height: 1,
          backgroundColor: colors.rule,
          marginHorizontal: 12,
        },
        list: {
          flex: 1,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: "center" as const,
        },
        empty: {
          alignItems: "center" as const,
          paddingHorizontal: 32,
          paddingVertical: 48,
        },
        emptyTitle: {
          fontSize: 13,
          color: colors.inkMuted,
          marginBottom: 4,
        },
        emptySubtitle: {
          fontSize: 12,
          color: colors.inkMuted,
          opacity: 0.6,
        },
        footer: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          paddingHorizontal: 16,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: colors.rule,
        },
        footerLeft: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 8,
        },
        footerRight: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 4,
        },
        avatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.accentLight,
          borderWidth: 1,
          borderColor: colors.rule,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          overflow: "hidden" as const,
        },
        avatarImage: {
          width: 28,
          height: 28,
          borderRadius: 14,
        },
        avatarText: {
          fontSize: 12,
          fontWeight: "700" as const,
          color: colors.accent,
        },
        footerButton: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 4,
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 8,
        },
        footerButtonText: {
          fontSize: 12,
          fontWeight: "600" as const,
          color: colors.inkMuted,
        },
      }),
    [colors]
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.logoRow} onPress={handleNewChat}>
          <View style={s.logoCircle}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.appName}>Synapse</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <Pressable
          style={({ pressed }) => [s.actionButton, pressed && s.actionPressed]}
          onPress={handleNewChat}
        >
          <Plus size={16} color={colors.inkMuted} />
          <Text style={s.actionLabel}>{t("newChat")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.actionButton, pressed && s.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/memory" as never); }}
        >
          <Brain size={16} color={colors.inkMuted} />
          <Text style={s.actionLabel}>{t("memory")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.actionButton, pressed && s.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/notion" as never); }}
        >
          <Database size={16} color={colors.inkMuted} />
          <Text style={s.actionLabel}>Notion</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.actionButton, pressed && s.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/personas" as never); }}
        >
          <Settings size={16} color={colors.inkMuted} />
          <Text style={s.actionLabel}>{t("personas")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.actionButton, pressed && s.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/plans" as never); }}
        >
          <CreditCard size={16} color={colors.inkMuted} />
          <Text style={s.actionLabel}>{t("plans")}</Text>
        </Pressable>
      </View>

      <View style={s.divider} />

      {/* Thread list */}
      <FlatList
        data={threads ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        style={s.list}
        contentContainerStyle={threads?.length === 0 ? s.emptyContainer : undefined}
        ListEmptyComponent={
          threads !== undefined ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>{t("noConversations")}</Text>
              <Text style={s.emptySubtitle}>{t("startNewChat")}</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      />

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={s.footerLeft}>
          <Pressable
            style={s.avatar}
            onPress={() => { closeDrawer(); router.push("/(home)/settings" as never); }}
            accessibilityLabel={i18n.language === "es" ? "Cuenta" : "Account"}
          >
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarText}>{initials}</Text>
            )}
          </Pressable>
        </View>
        <View style={s.footerRight}>
          <Pressable style={s.footerButton} onPress={toggleTheme}>
            {theme === "dark" ? (
              <Sun size={14} color={colors.inkMuted} />
            ) : (
              <Moon size={14} color={colors.inkMuted} />
            )}
          </Pressable>
          <Pressable style={s.footerButton} onPress={toggleLanguage}>
            <Globe size={14} color={colors.inkMuted} />
            <Text style={s.footerButtonText}>
              {i18n.language === "en" ? "ES" : "EN"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
