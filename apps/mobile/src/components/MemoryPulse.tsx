import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { useColors } from "../contexts/ThemeContext";

/**
 * Displays live memory stats from the user's knowledge graph.
 * Prominent indicator on the home screen communicating Synapse's memory.
 * Reactive — auto-updates when user_memory changes.
 */
export function MemoryPulse() {
  const stats = useQuery(api.userMemory.get);
  const { t } = useTranslation("chat");
  const colors = useColors();

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: "center",
          gap: 6,
          marginTop: 12,
        },
        statsRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        dot: {
          width: 8,
          height: 8,
          borderRadius: 4,
        },
        dotActive: {
          backgroundColor: "rgba(16, 185, 129, 0.7)",
        },
        dotLoading: {
          backgroundColor: colors.inkMuted,
          opacity: 0.3,
        },
        statsText: {
          fontSize: 14,
          color: colors.ink,
          opacity: 0.7,
        },
        tokensText: {
          fontSize: 14,
          color: colors.inkMuted,
          opacity: 0.5,
        },
        description: {
          fontSize: 12,
          color: colors.inkMuted,
          opacity: 0.5,
          textAlign: "center",
          maxWidth: 280,
        },
      }),
    [colors]
  );

  // Loading state
  if (stats === undefined) {
    return (
      <View style={s.container}>
        <View style={s.statsRow}>
          <View style={[s.dot, s.dotLoading]} />
          <Text style={[s.statsText, { opacity: 0.4 }]}>
            {t("memoryPulse.loading")}
          </Text>
        </View>
      </View>
    );
  }

  // No stats yet (new user)
  if (!stats || (stats.entityCount === 0 && stats.relationshipCount === 0)) {
    return (
      <Text style={[s.description, { marginTop: 12 }]}>
        {t("memoryPulse.building")}
      </Text>
    );
  }

  const totalMemories = stats.entityCount + stats.relationshipCount;
  const formattedTokens = stats.totalTokens >= 1000
    ? `~${Math.round(stats.totalTokens / 1000)}K`
    : `${stats.totalTokens}`;

  return (
    <View style={s.container}>
      <View style={s.statsRow}>
        <View style={[s.dot, s.dotActive]} />
        <Text style={s.statsText}>
          {totalMemories.toLocaleString()} {t("memoryPulse.memories")}
          {stats.totalTokens > 0 && (
            <Text style={s.tokensText}>
              {" · "}{formattedTokens} tokens
            </Text>
          )}
        </Text>
      </View>

      <Text style={s.description}>
        {t("memoryPulse.description", {
          count: totalMemories.toLocaleString(),
        })}
      </Text>
    </View>
  );
}
