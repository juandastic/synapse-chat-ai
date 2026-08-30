import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { useQuery, useMutation } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Menu, Brain, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureError } from "../../src/lib/analytics";

import { useColors } from "../../src/contexts/ThemeContext";
import { ChatProvider } from "../../src/contexts/ChatContext";
import { useChatContext } from "../../src/contexts/useChatContext";
import { PersonaIcon } from "../../src/components/PersonaIcon";
import { MessageList } from "../../src/components/MessageList";
import { ChatInput } from "../../src/components/ChatInput";

export default function ChatScreen() {
  const { threadId: rawId } = useLocalSearchParams<{ threadId: string }>();
  const threadId = rawId as Id<"threads">;
  const thread = useQuery(api.threads.get, { threadId });
  const { t } = useTranslation("chat");
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const navigation = useNavigation();
  const router = useRouter();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.paper,
        },
        centered: {
          flex: 1,
          backgroundColor: colors.paper,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        },
        fallbackHeader: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingBottom: 10,
          backgroundColor: colors.paper,
        },
        fallbackMenuButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
        },
        loadingText: {
          fontSize: 14,
          color: colors.inkMuted,
        },
        errorText: {
          fontSize: 15,
          color: colors.error,
        },
        goHomeButton: {
          marginTop: 8,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: colors.accent,
        },
        goHomeText: {
          fontSize: 14,
          fontWeight: "600",
          color: "#fff",
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
          backgroundColor: colors.paper,
        },
        headerButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
        },
        headerButtonDisabled: {
          opacity: 0.5,
        },
        headerCenter: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 4,
        },
        headerTitle: {
          fontSize: 16,
          fontWeight: "600",
          color: colors.ink,
          flexShrink: 1,
        },
        titleInput: {
          flex: 1,
          fontSize: 16,
          fontWeight: "600",
          color: colors.ink,
          borderBottomWidth: 1,
          borderBottomColor: colors.accent,
          paddingVertical: 2,
          paddingHorizontal: 4,
        },
      }),
    [colors],
  );

  if (thread === undefined) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.fallbackHeader}>
          <Pressable
            style={s.fallbackMenuButton}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            accessibilityLabel="Open menu"
          >
            <Menu size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={s.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.loadingText}>{t("chatView.loadingThread")}</Text>
        </View>
      </View>
    );
  }

  if (thread === null) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.fallbackHeader}>
          <Pressable
            style={s.fallbackMenuButton}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            accessibilityLabel="Open menu"
          >
            <Menu size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={s.centered}>
          <Text style={s.errorText}>{t("chatView.threadAccessDenied")}</Text>
          <Pressable
            style={s.goHomeButton}
            onPress={() => router.replace("/(home)" as never)}
          >
            <Text style={s.goHomeText}>{t("personaSelector.title")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ChatProvider threadId={threadId}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : isKeyboardVisible
              ? "padding"
              : undefined
        }
        keyboardVerticalOffset={0}
      >
        <ChatHeader
          threadId={threadId}
          title={thread.title}
          personaIcon={thread.persona.icon}
          personaName={thread.persona.name}
          s={s}
          colors={colors}
        />
        <MessageList
          personaIcon={thread.persona.icon}
          personaName={thread.persona.name}
        />
        <ChatInput threadId={threadId} promptState={thread.promptState} />
      </KeyboardAvoidingView>
    </ChatProvider>
  );
}

function ChatHeader({
  threadId,
  title,
  personaIcon,
  s,
  colors,
}: {
  threadId: Id<"threads">;
  title: string;
  personaIcon: string;
  personaName: string;
  s: any;
  colors: any;
}) {
  const { t } = useTranslation("chat");
  const { t: ts } = useTranslation("sidebar");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const posthog = usePostHog();
  const updateTitle = useMutation(api.threads.updateTitle);
  const forceClose = useMutation(api.sessions.forceClose);
  const removeThread = useMutation(api.threads.remove);
  const { isGenerating } = useChatContext();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const consolidatingRef = useRef(false);

  const handleTitleSave = useCallback(async () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === title) {
      setEditValue(title);
      return;
    }
    try {
      await updateTitle({ threadId, title: trimmed });
      posthog?.capture("thread_title_edited", { thread_id: threadId });
    } catch (err) {
      Alert.alert("Error", t("chatView.updateTitleFailed"));
      setEditValue(title);
      captureError(err, { source: "chat_header", action: "update_title" });
    }
  }, [editValue, title, updateTitle, threadId, t, posthog]);

  const handleConsolidate = useCallback(async () => {
    if (consolidatingRef.current || isGenerating) return;
    consolidatingRef.current = true;
    setIsConsolidating(true);
    try {
      const result = await forceClose({ threadId });
      if (!result.success) {
        Alert.alert("", result.message);
        return;
      }

      if (result.ingestEnqueued) {
        posthog?.capture("memory_consolidation_triggered", {
          thread_id: threadId,
        });
      }
      Alert.alert(
        "",
        result.ingestEnqueued
          ? t("chatView.consolidationStarted")
          : t("chatView.sessionClosed"),
      );
    } catch (err) {
      Alert.alert("Error", t("chatView.consolidationFailed"));
      captureError(err, {
        source: "chat_header",
        action: "consolidate_memory",
      });
    } finally {
      consolidatingRef.current = false;
      setIsConsolidating(false);
    }
  }, [forceClose, threadId, t, posthog, isGenerating]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      ts("deleteThreadTitle", { title }),
      ts("deleteThreadDescription"),
      [
        { text: ts("cancel"), style: "cancel" },
        {
          text: ts("deleteThread"),
          style: "destructive",
          onPress: async () => {
            try {
              await removeThread({ threadId });
              posthog?.capture("thread_deleted_from_chat", {
                thread_id: threadId,
              });
              router.replace("/(home)" as never);
            } catch (err) {
              captureError(err, {
                source: "chat_header",
                action: "delete_thread",
              });
            }
          },
        },
      ],
    );
  }, [removeThread, threadId, title, ts, posthog, router]);

  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <Pressable
        style={s.headerButton}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        accessibilityLabel="Open menu"
      >
        <Menu size={22} color={colors.ink} />
      </Pressable>

      <View style={s.headerCenter}>
        <PersonaIcon icon={personaIcon} size="sm" />
        <View style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <TextInput
              style={s.titleInput}
              value={editValue}
              onChangeText={setEditValue}
              onBlur={handleTitleSave}
              onSubmitEditing={handleTitleSave}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              maxLength={200}
            />
          ) : (
            <Pressable
              onPress={() => {
                setEditValue(title);
                setIsEditing(true);
              }}
            >
              <Text style={s.headerTitle} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
          )}
          <MobileMemorySubtitle colors={colors} />
        </View>
      </View>

      <Pressable
        style={[
          s.headerButton,
          (isConsolidating || isGenerating) && s.headerButtonDisabled,
        ]}
        onPress={handleConsolidate}
        disabled={isConsolidating || isGenerating}
        accessibilityLabel={t("chatView.consolidateMemory")}
        accessibilityHint={
          isGenerating
            ? t("chatView.waitForResponseBeforeConsolidating")
            : undefined
        }
        accessibilityState={{
          disabled: isConsolidating || isGenerating,
          busy: isConsolidating,
        }}
      >
        {isConsolidating ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Brain size={20} color={colors.accent} />
        )}
      </Pressable>

      <Pressable
        style={s.headerButton}
        onPress={handleDelete}
        accessibilityLabel={ts("deleteThread")}
      >
        <Trash2 size={18} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

// =============================================================================
// MobileMemorySubtitle — inline memory indicator below thread title
// =============================================================================

function MobileMemorySubtitle({ colors }: { colors: any }) {
  const stats = useQuery(api.userMemory.get);
  const { t } = useTranslation("chat");

  if (!stats || (stats.entityCount === 0 && stats.relationshipCount === 0)) {
    return null;
  }

  const totalMemories = stats.entityCount + stats.relationshipCount;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 1,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: "rgba(16, 185, 129, 0.7)",
        }}
      />
      <Text style={{ fontSize: 11, color: colors.inkMuted }} numberOfLines={1}>
        {t("memoryStatus.memories", { count: totalMemories.toLocaleString() })}
      </Text>
    </View>
  );
}
