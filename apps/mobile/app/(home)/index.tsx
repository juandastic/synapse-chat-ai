import { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { useQuery, useMutation } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useUser } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Menu, ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { captureError } from "../../src/lib/analytics";

import { useColors } from "../../src/contexts/ThemeContext";
import { PersonaIcon } from "../../src/components/PersonaIcon";
import { MemoryPulse } from "../../src/components/MemoryPulse";

const TEMPLATES_EN = [
  { key: "therapist-en", icon: "compass", nameKey: "personaTemplates.therapist.name", descKey: "personaTemplates.therapist.description" },
  { key: "wellbeing-en", icon: "leaf", nameKey: "personaTemplates.wellbeing.name", descKey: "personaTemplates.wellbeing.description" },
  { key: "coach-en", icon: "zap", nameKey: "personaTemplates.coach.name", descKey: "personaTemplates.coach.description" },
] as const;

const TEMPLATES_ES = [
  { key: "therapist-es", icon: "compass", nameKey: "personaTemplates.therapist.name", descKey: "personaTemplates.therapist.description" },
  { key: "wellbeing-es", icon: "leaf", nameKey: "personaTemplates.wellbeing.name", descKey: "personaTemplates.wellbeing.description" },
  { key: "coach-es", icon: "zap", nameKey: "personaTemplates.coach.name", descKey: "personaTemplates.coach.description" },
] as const;

export default function PersonaSelectorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const { user } = useUser();
  const personas = useQuery(api.personas.list);
  // Reuse threads.list (shared with drawer ThreadList) — no extra query.
  // Frontend persona join avoids N persona reads in the backend.
  const rawThreads = useQuery(api.threads.list);
  const recentThreads = useMemo(() => {
    if (!rawThreads || rawThreads.length === 0) return null;
    const personaMap = new Map(
      (personas ?? []).map((p) => [p._id, { name: p.name, icon: p.icon }])
    );
    return rawThreads.slice(0, 3).map((thread) => ({
      ...thread,
      persona: personaMap.get(thread.personaId) ?? { name: "Unknown", icon: "❓" },
    }));
  }, [rawThreads, personas]);
  const createFromTemplate = useMutation(api.personas.createFromTemplate);
  const createThread = useMutation(api.threads.create);
  const { t, i18n } = useTranslation("chat");
  const { t: ts } = useTranslation("sidebar");
  const insets = useSafeAreaInsets();
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const colors = useColors();

  const allTemplates = i18n.language === "es" ? TEMPLATES_ES : TEMPLATES_EN;

  // Build a unified list: custom personas + un-adopted templates (same visual)
  type GridItem =
    | { kind: "persona"; id: string; icon: string; name: string; description?: string }
    | { kind: "template"; key: string; icon: string; name: string; description: string };

  const gridItems = useMemo<GridItem[]>(() => {
    if (!personas) return [];

    const items: GridItem[] = personas.map((p) => ({
      kind: "persona" as const,
      id: p._id,
      icon: p.icon,
      name: p.name,
      description: p.description,
    }));

    // Append un-adopted templates (suppress those whose name matches an existing persona)
    const personaNames = new Set(personas.map((p) => p.name.toLowerCase()));
    for (const tmpl of allTemplates) {
      const name = t(tmpl.nameKey);
      if (!personaNames.has(name.toLowerCase())) {
        items.push({
          kind: "template" as const,
          key: tmpl.key,
          icon: tmpl.icon,
          name,
          description: t(tmpl.descKey),
        });
      }
    }

    return items;
  }, [personas, allTemplates, t]);

  const s = useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    header: {
      paddingHorizontal: 12,
      paddingBottom: 4,
    },
    menuButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    listHeader: {
      alignItems: "center",
      marginBottom: 24,
      paddingTop: 16,
    },
    logoCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    logoText: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.accent,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.ink,
      textAlign: "center",
      letterSpacing: -0.3,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.inkMuted,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 16,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    card: {
      width: "48%",
      flexGrow: 1,
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 20,
      gap: 8,
    },
    // cardTemplate removed — unified grid, no visual distinction
    cardPressed: {
      backgroundColor: colors.accentLight,
      transform: [{ scale: 0.97 }],
    },
    cardName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.ink,
      textAlign: "center",
    },
    cardDesc: {
      fontSize: 12,
      color: colors.inkMuted,
      textAlign: "center",
      lineHeight: 16,
    },
    // divider styles removed — unified grid
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingTop: 24,
    },
    pendingText: {
      fontSize: 14,
      color: colors.inkMuted,
    },
    skeletonCard: {
      width: "48%",
      flexGrow: 1,
      height: 140,
      borderRadius: 16,
      backgroundColor: colors.accentLight,
    },
  }), [colors]);

  const handleSelectPersona = useCallback(
    async (personaId: Id<"personas">, personaName?: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setIsPending(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        posthog?.capture("persona_selected", { persona_id: personaId, ...(personaName ? { persona_name: personaName } : {}), type: "custom" });
        const threadId = await createThread({ personaId });
        router.push(`/(home)/${threadId}` as never);
      } catch (err) {
        console.error("[PersonaSelector] Failed to create thread:", err);
        captureError(err, { source: "persona_selector", action: "create_thread" });
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    },
    [createThread, router, posthog]
  );

  const handleSelectTemplate = useCallback(
    async (templateKey: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setIsPending(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        posthog?.capture("persona_selected", { persona_name: templateKey, type: "template" });
        const personaId = await createFromTemplate({ templateKey });
        const threadId = await createThread({ personaId });
        router.push(`/(home)/${threadId}` as never);
      } catch (err) {
        console.error("[PersonaSelector] Failed to create from template:", err);
        captureError(err, { source: "persona_selector", action: "create_from_template" });
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    },
    [createFromTemplate, createThread, router, posthog]
  );

  const hasRecentThreads = recentThreads && recentThreads.length > 0;

  // Context-aware greeting and subtitle
  const greeting = hasRecentThreads
    ? (user?.firstName
        ? t("personaSelector.greetingWithName", { name: user.firstName })
        : t("personaSelector.greetingReturning"))
    : t("personaSelector.greetingNew");

  const subtitle = hasRecentThreads
    ? t("personaSelector.subtitleReturning")
    : t("personaSelector.subtitleNew");

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          style={s.menuButton}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          accessibilityLabel="Open menu"
        >
          <Menu size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Logo + greeting */}
        <View style={s.listHeader}>
          <View style={s.logoCircle}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.title}>{greeting}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>

        {/* Recent conversations */}
        {hasRecentThreads && (
          <RecentThreads
            threads={recentThreads}
            colors={colors}
            t={t}
            ts={ts}
            onNavigate={(threadId) => router.push(`/(home)/${threadId}` as never)}
            onViewAll={() => navigation.dispatch(DrawerActions.openDrawer())}
          />
        )}

        {/* Section label for persona grid (returning users only) */}
        {hasRecentThreads && gridItems.length > 0 && (
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 12 }}>
            {t("personaSelector.newConversation")}
          </Text>
        )}

        {/* Loading skeleton */}
        {personas === undefined && (
          <View style={s.grid}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={s.skeletonCard} />
            ))}
          </View>
        )}

        {/* Unified personas grid (custom + un-adopted templates) */}
        {gridItems.length > 0 && (
          <View style={s.grid}>
            {gridItems.map((item) => (
              <Pressable
                key={item.kind === "persona" ? item.id : item.key}
                style={({ pressed }) => [s.card, pressed && s.cardPressed]}
                onPress={() =>
                  item.kind === "persona"
                    ? handleSelectPersona(item.id as Id<"personas">, item.name)
                    : handleSelectTemplate(item.key)
                }
                disabled={isPending}
              >
                <PersonaIcon icon={item.icon} size="lg" />
                <Text style={s.cardName}>{item.name}</Text>
                {item.description ? (
                  <Text style={s.cardDesc} numberOfLines={3}>{item.description}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {/* Pending indicator */}
        {isPending && (
          <View style={s.pendingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={s.pendingText}>{t("personaSelector.creating")}</Text>
          </View>
        )}

        {/* Memory pulse — quiet footer */}
        <MemoryPulse />
      </ScrollView>
    </View>
  );
}

// =============================================================================
// RecentThreads — "Continue where you left off"
// =============================================================================

interface RecentThread {
  _id: string;
  title: string;
  lastMessageAt: number;
  persona: { name: string; icon: string };
}

function RecentThreads({
  threads,
  colors,
  t,
  ts,
  onNavigate,
  onViewAll,
}: {
  threads: RecentThread[];
  colors: any;
  t: (key: string) => string;
  ts: (key: string, opts?: Record<string, unknown>) => string;
  onNavigate: (threadId: string) => void;
  onViewAll: () => void;
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>
          {t("personaSelector.recentThreads")}
        </Text>
        <Pressable
          onPress={onViewAll}
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "500", color: colors.inkMuted }}>
            {t("personaSelector.viewAll")}
          </Text>
          <ChevronRight size={14} color={colors.inkMuted} />
        </Pressable>
      </View>
      {threads.map((thread) => (
        <Pressable
          key={thread._id}
          onPress={() => onNavigate(thread._id)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: pressed ? colors.accentLight : colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.rule,
            paddingHorizontal: 14,
            paddingVertical: 11,
            marginBottom: 8,
          })}
        >
          <PersonaIcon icon={thread.persona.icon} size="sm" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.ink }} numberOfLines={1}>
              {thread.title}
            </Text>
            <Text style={{ fontSize: 11, color: colors.inkMuted, opacity: 0.6, marginTop: 2 }}>
              {getRelativeTime(thread.lastMessageAt, ts)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Simple relative time formatter (mirrors sidebar/ThreadListItem).
 */
function getRelativeTime(
  timestamp: number,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return t("time.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("time.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return t("time.daysAgo", { count: diffDay });
  const diffMonth = Math.floor(diffDay / 30);
  return t("time.monthsAgo", { count: diffMonth });
}
