import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Brain, X } from "lucide-react-native";
import { api } from "@synapse/backend/api";

import { useColors } from "../contexts/ThemeContext";

/**
 * One-time non-modal banner shown on the home screen explaining the memory
 * feature. Dismissing (tap X or Got it) persists `memoryIntroSeen` so it won't
 * re-appear. Mirrors the web MemoryIntroToast.
 */
export function MemoryIntroBanner() {
  const convexUser = useQuery(api.users.me);
  const setSeen = useMutation(api.users.setMemoryIntroSeen);
  const { i18n } = useTranslation();
  const colors = useColors();
  const [hiddenLocally, setHiddenLocally] = useState(false);

  const isEs = i18n.language === "es";

  const handleDismiss = useCallback(() => {
    setHiddenLocally(true);
    setSeen().catch(() => {
      /* non-critical — the user dismissed locally; retry on next load */
    });
  }, [setSeen]);

  const s = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          marginHorizontal: 12,
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.accentLight,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
        },
        iconWrap: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.paper,
          alignItems: "center",
          justifyContent: "center",
        },
        body: { flex: 1, gap: 8 },
        text: { fontSize: 13, lineHeight: 18, color: colors.ink },
        actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
        gotItBtn: {
          backgroundColor: colors.ink,
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 6,
        },
        gotItText: { fontSize: 12, fontWeight: "600", color: colors.paper },
        closeBtn: {
          width: 24,
          height: 24,
          alignItems: "center",
          justifyContent: "center",
        },
      }),
    [colors]
  );

  // Don't render until we know the flag; don't re-render after dismissal.
  if (!convexUser || convexUser.memoryIntroSeenAt || hiddenLocally) return null;

  return (
    <View style={s.wrapper}>
      <View style={s.iconWrap}>
        <Brain size={16} color={colors.accent} />
      </View>
      <View style={s.body}>
        <Text style={s.text}>
          {isEs
            ? "Synapse recuerda lo que compartes para personalizar respuestas. Puedes ver o eliminar tu memoria en la sección Memoria."
            : "Synapse remembers what you share to personalize responses. You can view or delete your memory in the Memory section."}
        </Text>
        <View style={s.actions}>
          <Pressable style={s.gotItBtn} onPress={handleDismiss}>
            <Text style={s.gotItText}>
              {isEs ? "Entendido" : "Got it"}
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable style={s.closeBtn} onPress={handleDismiss} accessibilityLabel="Close">
        <X size={16} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}
