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
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id } from "@synapse/backend/dataModel";
import { Menu } from "lucide-react-native";
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
  const personas = useQuery(api.personas.list);
  const createFromTemplate = useMutation(api.personas.createFromTemplate);
  const createThread = useMutation(api.threads.create);
  const { t, i18n } = useTranslation("chat");
  const insets = useSafeAreaInsets();
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const colors = useColors();

  const systemTemplates = i18n.language === "es" ? TEMPLATES_ES : TEMPLATES_EN;

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
    cardTemplate: {
      borderStyle: "dashed",
    },
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
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginVertical: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.rule,
    },
    dividerText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.inkMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
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

  const hasCustomPersonas = personas && personas.length > 0;

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
        {/* Logo + title */}
        <View style={s.listHeader}>
          <View style={s.logoCircle}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.title}>{t("personaSelector.title")}</Text>
          <Text style={s.subtitle}>{t("personaSelector.subtitle")}</Text>
          <MemoryPulse />
        </View>

        {/* Loading skeleton */}
        {personas === undefined && (
          <View style={s.grid}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={s.skeletonCard} />
            ))}
          </View>
        )}

        {/* Custom personas grid */}
        {hasCustomPersonas && (
          <View style={s.grid}>
            {personas.map((persona) => (
              <Pressable
                key={persona._id}
                style={({ pressed }) => [s.card, pressed && s.cardPressed]}
                onPress={() => handleSelectPersona(persona._id, persona.name)}
                disabled={isPending}
              >
                <PersonaIcon icon={persona.icon} size="lg" />
                <Text style={s.cardName}>{persona.name}</Text>
                {persona.description ? (
                  <Text style={s.cardDesc} numberOfLines={3}>{persona.description}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {/* Templates divider */}
        {hasCustomPersonas && (
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>{t("personaSelector.templates")}</Text>
            <View style={s.dividerLine} />
          </View>
        )}

        {/* System templates grid */}
        {personas !== undefined && (
          <View style={s.grid}>
            {systemTemplates.map((template) => (
              <Pressable
                key={template.key}
                style={({ pressed }) => [s.card, s.cardTemplate, pressed && s.cardPressed]}
                onPress={() => handleSelectTemplate(template.key)}
                disabled={isPending}
              >
                <PersonaIcon icon={template.icon} size="lg" />
                <Text style={s.cardName}>{t(template.nameKey)}</Text>
                <Text style={s.cardDesc} numberOfLines={3}>{t(template.descKey)}</Text>
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
      </ScrollView>
    </View>
  );
}
