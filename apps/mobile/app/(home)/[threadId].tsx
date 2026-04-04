import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { useQuery, useMutation } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Menu, Brain } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureError } from "../../src/lib/analytics";

import { colors } from "../../src/constants/colors";
import { ChatProvider } from "../../src/contexts/ChatContext";
import { PersonaIcon } from "../../src/components/PersonaIcon";
import { MessageList } from "../../src/components/MessageList";
import { ChatInput } from "../../src/components/ChatInput";

export default function ChatScreen() {
  const { threadId: rawId } = useLocalSearchParams<{ threadId: string }>();
  const threadId = rawId as Id<"threads">;
  const thread = useQuery(api.threads.get, { threadId });
  const { t } = useTranslation("chat");
  const insets = useSafeAreaInsets();

  if (thread === undefined) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>{t("chatView.loadingThread")}</Text>
      </View>
    );
  }

  if (thread === null) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{t("chatView.threadAccessDenied")}</Text>
      </View>
    );
  }

  return (
    <ChatProvider threadId={threadId}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ChatHeader
          threadId={threadId}
          title={thread.title}
          personaIcon={thread.persona.icon}
          personaName={thread.persona.name}
        />
        <MessageList
          personaIcon={thread.persona.icon}
          personaName={thread.persona.name}
        />
        <ChatInput threadId={threadId} />
      </KeyboardAvoidingView>
    </ChatProvider>
  );
}

function ChatHeader({
  threadId,
  title,
  personaIcon,
}: {
  threadId: Id<"threads">;
  title: string;
  personaIcon: string;
  personaName: string;
}) {
  const { t } = useTranslation("chat");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const updateTitle = useMutation(api.threads.updateTitle);
  const forceClose = useMutation(api.sessions.forceClose);

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
    if (consolidatingRef.current) return;
    consolidatingRef.current = true;
    setIsConsolidating(true);
    try {
      await forceClose({ threadId });
      posthog?.capture("memory_consolidation_triggered", { thread_id: threadId });
      Alert.alert("", t("chatView.consolidationStarted"));
    } catch (err) {
      Alert.alert("Error", t("chatView.consolidationFailed"));
      captureError(err, { source: "chat_header", action: "consolidate_memory" });
    } finally {
      consolidatingRef.current = false;
      setIsConsolidating(false);
    }
  }, [forceClose, threadId, t, posthog]);

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable
        style={styles.headerButton}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        accessibilityLabel="Open menu"
      >
        <Menu size={22} color={colors.ink} />
      </Pressable>

      <View style={styles.headerCenter}>
        <PersonaIcon icon={personaIcon} size="sm" />
        {isEditing ? (
          <TextInput
            style={styles.titleInput}
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
          <Pressable onPress={() => { setEditValue(title); setIsEditing(true); }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={[styles.headerButton, isConsolidating && styles.headerButtonDisabled]}
        onPress={handleConsolidate}
        disabled={isConsolidating}
        accessibilityLabel={t("chatView.consolidateMemory")}
      >
        {isConsolidating ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Brain size={20} color={colors.accent} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  loadingText: {
    fontSize: 14,
    color: colors.inkMuted,
  },
  errorText: {
    fontSize: 15,
    color: colors.error,
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
});
