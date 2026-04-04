import { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Image,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import { useQuery, useMutation } from "convex/react";
import { useAuth, useUser } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Plus, Brain, Settings, Database, CreditCard, LogOut, Globe } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../constants/colors";
import { ThreadListItem } from "./ThreadListItem";

export function ThreadList({ navigation }: DrawerContentComponentProps) {
  const threads = useQuery(api.threads.list);
  const removeThread = useMutation(api.threads.remove);
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { t, i18n } = useTranslation("sidebar");
  const insets = useSafeAreaInsets();

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

  const handleSignOut = useCallback(() => {
    Alert.alert(t("signOut"), "", [
      { text: t("cancel"), style: "cancel" },
      { text: t("signOut"), style: "destructive", onPress: () => signOut() },
    ]);
  }, [signOut, t]);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.logoRow} onPress={handleNewChat}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>Synapse</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          onPress={handleNewChat}
        >
          <Plus size={16} color={colors.inkMuted} />
          <Text style={styles.actionLabel}>{t("newChat")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/memory" as never); }}
        >
          <Brain size={16} color={colors.inkMuted} />
          <Text style={styles.actionLabel}>{t("memory")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/notion" as never); }}
        >
          <Database size={16} color={colors.inkMuted} />
          <Text style={styles.actionLabel}>Notion</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/personas" as never); }}
        >
          <Settings size={16} color={colors.inkMuted} />
          <Text style={styles.actionLabel}>{t("personas")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          onPress={() => { closeDrawer(); router.push("/(home)/plans" as never); }}
        >
          <CreditCard size={16} color={colors.inkMuted} />
          <Text style={styles.actionLabel}>{t("plans")}</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {/* Thread list */}
      <FlatList
        data={threads ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={threads?.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          threads !== undefined ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t("noConversations")}</Text>
              <Text style={styles.emptySubtitle}>{t("startNewChat")}</Text>
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
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.footerLeft}>
          <Pressable style={styles.avatar} onPress={handleSignOut}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </Pressable>
        </View>
        <View style={styles.footerRight}>
          <Pressable style={styles.footerButton} onPress={toggleLanguage}>
            <Globe size={14} color={colors.inkMuted} />
            <Text style={styles.footerButtonText}>
              {i18n.language === "en" ? "ES" : "EN"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(139, 94, 60, 0.1)",
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
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
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
    color: "rgba(107, 94, 79, 0.5)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  footerButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkMuted,
  },
});
