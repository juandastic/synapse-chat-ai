import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { useAction, useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Menu, Search, ChevronRight, Send, RefreshCw } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureError } from "../../src/lib/analytics";

import { useColors } from "../../src/contexts/ThemeContext";
import { SlideUpModal } from "../../src/components/SlideUpModal";

interface GraphNode {
  id: string;
  name: string;
  val: number;
  summary?: string;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  fact?: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function MemoryScreen() {
  const { t } = useTranslation("memory");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const fetchGraph = useAction(api.graph.fetch);
  const correctGraph = useAction(api.graph.correct);
  const colors = useColors();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [correction, setCorrection] = useState("");
  const [isSendingCorrection, setIsSendingCorrection] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.paper },
    flex1: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.rule },
    headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    headerCenter: { flex: 1, alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
    headerStats: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
    loadingText: { fontSize: 14, color: colors.inkMuted },
    errorText: { fontSize: 14, color: colors.error, textAlign: "center" },
    retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    retryBtnText: { color: colors.primaryForeground, fontWeight: "600" },
    emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, textAlign: "center" },
    emptyDesc: { fontSize: 14, color: colors.inkMuted, textAlign: "center", lineHeight: 20 },
    filterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginVertical: 10, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 8 },
    filterInput: { flex: 1, fontSize: 14, color: colors.ink },
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
    inspectorSheet: { backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%" },
    inspectorHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.rule, alignSelf: "center", marginTop: 10, marginBottom: 8 },
    inspectorScroll: { paddingHorizontal: 20 },
    inspectorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    inspectorName: { fontSize: 18, fontWeight: "700", color: colors.ink },
    closeText: { fontSize: 13, color: colors.accent },
    inspectorSection: { marginTop: 8 },
    sectionLabel: { fontSize: 12, fontWeight: "600", color: colors.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
    sectionText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
    directionLabel: { fontSize: 12, fontWeight: "600", color: colors.accent, marginTop: 8, marginBottom: 4 },
    linkItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.rule },
    linkLabel: { fontSize: 13, color: colors.ink },
    linkFact: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 16, gap: 6 },
    nodeCard: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.rule, padding: 12 },
    nodeCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    nodeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    nodeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
    nodeInfo: { flex: 1 },
    nodeName: { fontSize: 14, fontWeight: "600", color: colors.ink },
    nodeSummary: { fontSize: 12, color: colors.inkMuted, marginTop: 1 },
    nodeCount: { fontSize: 12, color: colors.inkMuted, fontWeight: "600" },
    entityCount: { fontSize: 11, color: colors.inkMuted, textAlign: "center", paddingVertical: 12 },
    noMatches: { fontSize: 14, color: colors.inkMuted, textAlign: "center", paddingVertical: 24 },
    correctionBar: { borderTopWidth: 1, borderTopColor: colors.rule, paddingHorizontal: 16, paddingTop: 8 },
    feedbackText: { fontSize: 12, textAlign: "center", marginBottom: 6 },
    feedbackSuccess: { color: colors.accent },
    feedbackError: { color: colors.error },
    correctionRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    correctionInput: { flex: 1, fontSize: 14, color: colors.ink, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 80 },
    correctionSend: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    correctionSendDisabled: { backgroundColor: colors.accentLight },
  }), [colors]);

  const loadGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchGraph() as GraphData;
      setGraphData(data);
    } catch (err) {
      setError(t("explorer.failedToLoad"));
      captureError(err, { source: "memory", action: "fetch_graph" });
    } finally {
      setIsLoading(false);
    }
  }, [fetchGraph, t]);

  // Load on mount
  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    const q = filter.toLowerCase();
    return graphData.nodes
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.summary?.toLowerCase().includes(q))
      .sort((a, b) => b.val - a.val);
  }, [graphData, filter]);

  const selectedLinks = useMemo(() => {
    if (!selectedNode || !graphData) return { outgoing: [], incoming: [] };
    return {
      outgoing: graphData.links.filter((l) => l.source === selectedNode.id),
      incoming: graphData.links.filter((l) => l.target === selectedNode.id),
    };
  }, [selectedNode, graphData]);

  const [correctionIsError, setCorrectionIsError] = useState(false);

  const handleSendCorrection = useCallback(async () => {
    if (!correction.trim() || isSendingCorrection) return;
    setIsSendingCorrection(true);
    setCorrectionFeedback(null);
    try {
      await correctGraph({ correctionText: correction.trim() });
      setCorrectionFeedback(t("correction.success"));
      setCorrectionIsError(false);
      setCorrection("");
      refreshTimerRef.current = setTimeout(() => loadGraph(), 2000);
    } catch (err) {
      setCorrectionFeedback(t("correction.error"));
      setCorrectionIsError(true);
      captureError(err, { source: "memory", action: "correct_graph" });
    } finally {
      setIsSendingCorrection(false);
    }
  }, [correction, isSendingCorrection, correctGraph, t, loadGraph]);

  const getNodeName = (id: string) => graphData?.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Menu size={22} color={colors.ink} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t("explorer.title")}</Text>
          {graphData && (
            <Text style={s.headerStats}>
              {t("explorer.node", { count: graphData.nodes.length })} · {t("explorer.relationship", { count: graphData.links.length })}
            </Text>
          )}
        </View>
        <Pressable style={s.headerBtn} onPress={loadGraph} disabled={isLoading}>
          <RefreshCw size={18} color={isLoading ? colors.inkMuted : colors.accent} />
        </Pressable>
      </View>

      {/* Loading */}
      {isLoading && !graphData && (
        <View style={s.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.loadingText}>{t("explorer.loading")}</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={s.centered}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={loadGraph}>
            <Text style={s.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Empty */}
      {graphData && graphData.nodes.length === 0 && (
        <View style={s.centered}>
          <Text style={s.emptyTitle}>{t("explorer.noMemoriesTitle")}</Text>
          <Text style={s.emptyDesc}>{t("explorer.noMemoriesDescription")}</Text>
        </View>
      )}

      {/* Entity list */}
      {graphData && graphData.nodes.length > 0 && (
        <KeyboardAvoidingView
          style={s.flex1}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Filter */}
          <View style={s.filterRow}>
            <Search size={16} color={colors.inkMuted} />
            <TextInput
              style={s.filterInput}
              value={filter}
              onChangeText={setFilter}
              placeholder={t("entityList.filterPlaceholder")}
              placeholderTextColor={colors.inkMuted}
            />
          </View>

          {/* Node list */}
          <FlatList
            data={filteredNodes}
            keyExtractor={(item) => item.id}
            style={s.list}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={[s.nodeCard, selectedNode?.id === item.id && s.nodeCardSelected]}
                onPress={() => setSelectedNode(selectedNode?.id === item.id ? null : item)}
              >
                <View style={s.nodeRow}>
                  <View style={s.nodeDot} />
                  <View style={s.nodeInfo}>
                    <Text style={s.nodeName}>{item.name}</Text>
                    {item.summary && <Text style={s.nodeSummary} numberOfLines={1}>{item.summary}</Text>}
                  </View>
                  <Text style={s.nodeCount}>{item.val}</Text>
                  <ChevronRight size={16} color={colors.inkMuted} />
                </View>
              </Pressable>
            )}
            ListFooterComponent={
              <Text style={s.entityCount}>
                {t("entityList.entityCount", { filtered: filteredNodes.length, total: graphData.nodes.length })}
              </Text>
            }
            ListEmptyComponent={
              <Text style={s.noMatches}>{t("entityList.noMatches")}</Text>
            }
          />

          {/* Correction input */}
          <View style={[s.correctionBar, { paddingBottom: insets.bottom + 8 }]}>
            {correctionFeedback && (
              <Text style={[s.feedbackText, correctionIsError ? s.feedbackError : s.feedbackSuccess]}>
                {correctionFeedback}
              </Text>
            )}
            <View style={s.correctionRow}>
              <TextInput
                style={s.correctionInput}
                value={correction}
                onChangeText={setCorrection}
                placeholder={t("correction.placeholder")}
                placeholderTextColor={colors.inkMuted}
                multiline
                maxLength={1000}
              />
              <Pressable
                style={[s.correctionSend, (!correction.trim() || isSendingCorrection) && s.correctionSendDisabled]}
                onPress={handleSendCorrection}
                disabled={!correction.trim() || isSendingCorrection}
              >
                {isSendingCorrection ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Send size={16} color={correction.trim() ? colors.primaryForeground : colors.inkMuted} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
      {/* Node inspector modal */}
      <SlideUpModal
        visible={selectedNode !== null}
        onRequestClose={() => setSelectedNode(null)}
        onBackdropPress={() => setSelectedNode(null)}
      >
        <View style={[s.inspectorSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.inspectorHandle} />
          {selectedNode && (
            <ScrollView style={s.inspectorScroll} showsVerticalScrollIndicator={false}>
              <View style={s.inspectorHeader}>
                <Text style={s.inspectorName}>{selectedNode.name}</Text>
                <Pressable onPress={() => setSelectedNode(null)}>
                  <Text style={s.closeText}>{t("inspector.closeInspector")}</Text>
                </Pressable>
              </View>
              {selectedNode.summary && (
                <View style={s.inspectorSection}>
                  <Text style={s.sectionLabel}>{t("inspector.summary")}</Text>
                  <Text style={s.sectionText}>{selectedNode.summary}</Text>
                </View>
              )}
              <View style={s.inspectorSection}>
                <Text style={s.sectionLabel}>
                  {t("inspector.connections")} · {t("inspector.relationship", { count: selectedLinks.outgoing.length + selectedLinks.incoming.length })}
                </Text>
                {selectedLinks.outgoing.length > 0 && (
                  <>
                    <Text style={s.directionLabel}>{t("inspector.outgoing")}</Text>
                    {selectedLinks.outgoing.map((link, i) => (
                      <Pressable
                        key={`out-${i}`}
                        style={s.linkItem}
                        onPress={() => {
                          const node = graphData?.nodes.find((n) => n.id === link.target);
                          if (node) setSelectedNode(node);
                        }}
                      >
                        <Text style={s.linkLabel}>→ {link.label} → {getNodeName(link.target)}</Text>
                        {link.fact && <Text style={s.linkFact}>{link.fact}</Text>}
                      </Pressable>
                    ))}
                  </>
                )}
                {selectedLinks.incoming.length > 0 && (
                  <>
                    <Text style={s.directionLabel}>{t("inspector.incoming")}</Text>
                    {selectedLinks.incoming.map((link, i) => (
                      <Pressable
                        key={`in-${i}`}
                        style={s.linkItem}
                        onPress={() => {
                          const node = graphData?.nodes.find((n) => n.id === link.source);
                          if (node) setSelectedNode(node);
                        }}
                      >
                        <Text style={s.linkLabel}>← {getNodeName(link.source)} → {link.label}</Text>
                        {link.fact && <Text style={s.linkFact}>{link.fact}</Text>}
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </SlideUpModal>
    </View>
  );
}
