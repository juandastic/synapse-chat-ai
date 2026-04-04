import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type { Doc } from "@synapse/backend/dataModel";

import { colors } from "../constants/colors";
import { useChatContext } from "../contexts/useChatContext";
import { MessageItem } from "./MessageItem";
import { MessageActions } from "./MessageActions";
import { SessionDivider } from "./SessionDivider";
import { PersonaIcon } from "./PersonaIcon";

interface MessageListProps {
  personaIcon?: string;
  personaName?: string;
}

type ListItem =
  | { type: "message"; data: Doc<"messages">; isStreaming: boolean }
  | { type: "session-divider"; timestamp: number; key: string };

export function MessageList({ personaIcon, personaName }: MessageListProps) {
  const { messages, isLoading } = useChatContext();
  const { t } = useTranslation("chat");

  const bottomSheetRef = useRef<BottomSheet>(null);
  const [selectedMessage, setSelectedMessage] = useState<Doc<"messages"> | null>(null);
  const snapPoints = useMemo(() => ["35%"], []);

  const handleMessageLongPress = useCallback((message: Doc<"messages">) => {
    setSelectedMessage(message);
    bottomSheetRef.current?.expand();
  }, []);

  const handleCloseSheet = useCallback(() => {
    bottomSheetRef.current?.close();
    setSelectedMessage(null);
  }, []);

  // Build list items with session dividers, reversed for inverted FlatList
  const listItems = useMemo((): ListItem[] => {
    if (!messages || messages.length === 0) return [];

    const items: ListItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const prev = messages[i - 1];

      if (prev && prev.sessionId !== msg.sessionId) {
        items.push({
          type: "session-divider",
          timestamp: msg._creationTime,
          key: `divider-${msg._id}`,
        });
      }

      items.push({
        type: "message",
        data: msg,
        isStreaming:
          msg.role === "assistant" && msg.completedAt === undefined,
      });
    }

    return items.reverse();
  }, [messages]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "session-divider") {
        return <SessionDivider timestamp={item.timestamp} />;
      }
      return (
        <MessageItem
          message={item.data}
          isStreaming={item.isStreaming}
          onLongPress={handleMessageLongPress}
        />
      );
    },
    [handleMessageLongPress]
  );

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.type === "session-divider") return item.key;
    return item.data._id;
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>{t("messageList.loadingConversation")}</Text>
      </View>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <View style={styles.centered}>
        {personaIcon && (
          <View style={styles.emptyIcon}>
            <PersonaIcon icon={personaIcon} size="xl" />
          </View>
        )}
        <Text style={styles.emptyTitle}>
          {personaName
            ? t("messageList.startConversationWith", { name: personaName })
            : t("messageList.startConversation")}
        </Text>
        <Text style={styles.emptyDesc}>
          {t("messageList.emptyStateDescription")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />

      {/* Shared action bottom sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView>
          {selectedMessage && (
            <MessageActions message={selectedMessage} onClose={handleCloseSheet} />
          )}
        </BottomSheetView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.inkMuted,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  sheetBackground: {
    backgroundColor: colors.paper,
  },
  sheetHandle: {
    backgroundColor: colors.rule,
  },
});
