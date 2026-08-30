import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { Doc } from "@synapse/backend/dataModel";

import { useColors } from "../contexts/ThemeContext";
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
  | {
      type: "message";
      data: Doc<"messages">;
      isStreaming: boolean;
      isLast: boolean;
    }
  | { type: "session-divider"; timestamp: number; key: string };

/** Threshold (px) to consider the user "scrolled away" from the bottom */
const SCROLL_THRESHOLD = 60;

export function MessageList({ personaIcon, personaName }: MessageListProps) {
  const { messages, isLoading } = useChatContext();
  const { t } = useTranslation("chat");
  const colors = useColors();

  const flatListRef = useRef<FlatList>(null);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [selectedMessage, setSelectedMessage] =
    useState<Doc<"messages"> | null>(null);
  const snapPoints = useMemo(() => ["35%"], []);

  // Scroll-to-bottom button state
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;
  const prevMessageCountRef = useRef(0);

  // Track whether user is near the bottom (offset 0 in inverted list)
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const isNearBottom = offsetY < SCROLL_THRESHOLD;
      setShowScrollButton(!isNearBottom);
    },
    [],
  );

  // Animate the scroll button in/out
  useEffect(() => {
    const anim = Animated.timing(scrollButtonOpacity, {
      toValue: showScrollButton ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [showScrollButton, scrollButtonOpacity]);

  // Only auto-scroll when a NEW message is added, not during streaming updates
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const count = messages.length;
    const hadMessages = prevMessageCountRef.current > 0;
    const hasNewMessage = count > prevMessageCountRef.current;
    prevMessageCountRef.current = count;

    if (!hadMessages) {
      // First load — jump to bottom instantly
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      setShowScrollButton(false);
    } else if (hasNewMessage) {
      // New message added — smooth scroll to bottom
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    // During streaming content updates (same message count), do NOT scroll
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowScrollButton(false);
  }, []);

  const handleMessageLongPress = useCallback((message: Doc<"messages">) => {
    setSelectedMessage(message);
    bottomSheetRef.current?.present();
  }, []);

  const handleCloseSheet = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  const handleSheetDismiss = useCallback(() => {
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
        isStreaming: msg.role === "assistant" && msg.completedAt === undefined,
        isLast: i === messages.length - 1,
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
          isLast={item.isLast}
          onActionsPress={handleMessageLongPress}
        />
      );
    },
    [handleMessageLongPress],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.type === "session-divider") return item.key;
    return item.data._id;
  }, []);

  const s = useMemo(
    () =>
      StyleSheet.create({
        listContainer: {
          flex: 1,
          position: "relative",
        },
        list: {
          flex: 1,
        },
        listContent: {
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8,
          gap: 8,
        },
        scrollButton: {
          position: "absolute",
          bottom: 12,
          right: 16,
          zIndex: 10,
        },
        scrollButtonInner: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 4,
        },
        scrollButtonArrow: {
          color: colors.primaryForeground,
          fontSize: 18,
          fontWeight: "700",
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
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={s.loadingText}>
          {t("messageList.loadingConversation")}
        </Text>
      </View>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <View style={s.centered}>
        {personaIcon && (
          <View style={s.emptyIcon}>
            <PersonaIcon icon={personaIcon} size="xl" />
          </View>
        )}
        <Text style={s.emptyTitle}>
          {personaName
            ? t("messageList.startConversationWith", { name: personaName })
            : t("messageList.startConversation")}
        </Text>
        <Text style={s.emptyDesc}>
          {t("messageList.emptyStateDescription")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={s.listContainer}>
        <FlatList
          ref={flatListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          scrollsChildToFocus={false}
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        />

        {/* Scroll-to-bottom floating button */}
        <Animated.View
          style={[s.scrollButton, { opacity: scrollButtonOpacity }]}
          pointerEvents={showScrollButton ? "auto" : "none"}
        >
          <Pressable onPress={scrollToBottom} style={s.scrollButtonInner}>
            <Text style={s.scrollButtonArrow}>↓</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Shared action bottom sheet */}
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={handleSheetDismiss}
        backgroundStyle={s.sheetBackground}
        handleIndicatorStyle={s.sheetHandle}
      >
        <BottomSheetView>
          {selectedMessage && (
            <MessageActions
              message={selectedMessage}
              onClose={handleCloseSheet}
            />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
