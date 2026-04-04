import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { useQuery, useMutation, useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Menu, Database, Check, Circle, Loader2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../src/constants/colors";

type Phase = "config" | "exporting" | "completed" | "failed" | "correcting" | "corrections-completed" | "corrections-failed";

const EXPORT_STEPS = ["hydrating", "analyzing", "extracting_entries", "creating_databases", "populating", "summarizing", "done"] as const;
const CORRECTION_STEPS = ["scanning", "applying", "done"] as const;

const POLL_INTERVAL = 30000;

export default function NotionScreen() {
  const { t, i18n } = useTranslation("notion");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const notionConfig = useQuery(api.notionConfig.getNotionConfig);
  const saveConfig = useMutation(api.notionConfig.saveNotionConfig);
  const startExport = useAction(api.notion.startExport);
  const getExportStatus = useAction(api.notion.getExportStatus);
  const startCorrections = useAction(api.notion.startCorrections);
  const getCorrectionsStatus = useAction(api.notion.getCorrectionsStatus);

  const [phase, setPhase] = useState<Phase>("config");
  const [token, setToken] = useState("");
  const [pageName, setPageName] = useState("");
  const [language, setLanguage] = useState("en");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Export state
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [exportResult, setExportResult] = useState<{ summaryPageUrl?: string; categoriesCount?: number; entriesCount?: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved config
  useEffect(() => {
    if (notionConfig) {
      if (notionConfig.notionToken) setToken(notionConfig.notionToken);
      if (notionConfig.notionPageName) setPageName(notionConfig.notionPageName);
      if (notionConfig.notionLanguage) setLanguage(notionConfig.notionLanguage);
    }
  }, [notionConfig]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollExportStatus = useCallback(async (jobId: string) => {
    try {
      const status = await getExportStatus({ jobId });
      if (status.progress?.currentStep) setCurrentStep(status.progress.currentStep);
      if (status.status === "completed") {
        stopPolling();
        setExportResult(status.result ?? null);
        setPhase("completed");
        setExportJobId(null);
      } else if (status.status === "failed") {
        stopPolling();
        setExportError(status.error || "Export failed");
        setPhase("failed");
        setExportJobId(null);
      }
    } catch {
      // Continue polling
    }
  }, [getExportStatus, stopPolling]);

  const handleExport = useCallback(async () => {
    if (!token.trim()) { setError(t("config.tokenRequired")); return; }
    if (!pageName.trim()) { setError(t("config.pageNameRequired")); return; }
    setIsStarting(true);
    setError(null);
    try {
      await saveConfig({ notionToken: token.trim(), notionPageName: pageName.trim(), notionLanguage: language });
      const result = await startExport({ notionToken: token.trim(), notionPageName: pageName.trim(), notionLanguage: language });
      const jobId = result.jobId;
      setExportJobId(jobId);
      setPhase("exporting");
      setCurrentStep("hydrating");
      // Job ID stored in state only — no persistence across app restarts
      pollRef.current = setInterval(() => pollExportStatus(jobId), POLL_INTERVAL);
    } catch {
      setError(t("export.failed"));
    } finally {
      setIsStarting(false);
    }
  }, [token, pageName, language, saveConfig, startExport, pollExportStatus, t]);

  const pollCorrectionsStatus = useCallback(async (jobId: string) => {
    try {
      const status = await getCorrectionsStatus({ jobId });
      if (status.progress?.currentStep) setCurrentStep(status.progress.currentStep);
      if (status.status === "completed") {
        stopPolling();
        setPhase("corrections-completed");
      } else if (status.status === "failed") {
        stopPolling();
        setPhase("corrections-failed");
      }
    } catch {
      // Continue polling
    }
  }, [getCorrectionsStatus, stopPolling]);

  const handleSync = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await startCorrections({ notionToken: token.trim(), notionPageName: pageName.trim(), notionLanguage: language });
      setPhase("correcting");
      setCurrentStep("scanning");
      const jobId = result.jobId;
      pollRef.current = setInterval(() => pollCorrectionsStatus(jobId), POLL_INTERVAL);
    } catch {
      setError(t("export.correctionsFailed"));
    } finally {
      setIsStarting(false);
    }
  }, [token, pageName, language, startCorrections, pollCorrectionsStatus, t]);

  const handleReset = useCallback(() => {
    stopPolling();
    setPhase("config");
    setExportResult(null);
    setExportError(null);
    setCurrentStep("");
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const hasSavedConfig = notionConfig?.notionToken;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Menu size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("title")}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Config phase */}
        {phase === "config" && (
          <>
            <View style={styles.hero}>
              <Database size={40} color={colors.accent} />
              <Text style={styles.heroTitle}>{t("hero.title")}</Text>
              <Text style={styles.heroDesc}>{t("hero.description")}</Text>
            </View>

            {error && <Text style={styles.errorBanner}>{error}</Text>}

            <Text style={styles.fieldLabel}>{t("config.tokenLabel")}</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder={t("config.tokenPlaceholder")}
              placeholderTextColor="rgba(107,94,79,0.4)"
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>{t("config.pageNameLabel")}</Text>
            <TextInput
              style={styles.input}
              value={pageName}
              onChangeText={setPageName}
              placeholder={t("config.pageNamePlaceholder")}
              placeholderTextColor="rgba(107,94,79,0.4)"
            />

            <Text style={styles.fieldLabel}>{t("config.languageLabel")}</Text>
            <View style={styles.langRow}>
              {[{ v: "en", l: "English" }, { v: "es", l: "Español" }].map((opt) => (
                <Pressable
                  key={opt.v}
                  style={[styles.langChip, language === opt.v && styles.langChipActive]}
                  onPress={() => setLanguage(opt.v)}
                >
                  <Text style={[styles.langChipText, language === opt.v && styles.langChipTextActive]}>{opt.l}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.primaryBtn, isStarting && styles.btnDisabled]}
              onPress={handleExport}
              disabled={isStarting}
            >
              {isStarting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>{t("export.exportButton")}</Text>}
            </Pressable>

            {hasSavedConfig && (
              <Pressable
                style={[styles.secondaryBtn, isStarting && styles.btnDisabled]}
                onPress={handleSync}
                disabled={isStarting}
              >
                <Text style={styles.secondaryBtnText}>{t("export.syncButton")}</Text>
              </Pressable>
            )}
          </>
        )}

        {/* Exporting / Correcting */}
        {(phase === "exporting" || phase === "correcting") && (
          <View style={styles.pipelineSection}>
            <Text style={styles.pipelineTitle}>
              {phase === "exporting" ? t("pipeline.exporting") : t("pipeline.correcting")}
            </Text>
            <Text style={styles.pipelineDesc}>
              {phase === "exporting" ? t("pipeline.exportingDescription") : t("pipeline.correctingDescription")}
            </Text>
            <View style={styles.stepsContainer}>
              {(phase === "exporting" ? EXPORT_STEPS : CORRECTION_STEPS).map((step) => {
                const steps = phase === "exporting" ? EXPORT_STEPS : CORRECTION_STEPS;
                const stepIndex = (steps as readonly string[]).indexOf(step);
                const currentIndex = (steps as readonly string[]).indexOf(currentStep);
                const isDone = stepIndex < currentIndex || currentStep === "done";
                const isActive = step === currentStep && currentStep !== "done";
                return (
                  <View key={step} style={styles.stepRow}>
                    {isDone ? (
                      <Check size={16} color={colors.accent} />
                    ) : isActive ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Circle size={16} color={colors.inkMuted} />
                    )}
                    <Text style={[styles.stepText, isDone && styles.stepDone, isActive && styles.stepActive]}>
                      {t(`steps.${step}`)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Completed */}
        {phase === "completed" && (
          <View style={styles.resultSection}>
            <Check size={48} color={colors.accent} />
            <Text style={styles.resultTitle}>{t("completed.exportComplete")}</Text>
            {exportResult?.summaryPageUrl && (
              <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(exportResult.summaryPageUrl!)}>
                <Text style={styles.primaryBtnText}>{t("completed.openInNotion")}</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={handleReset}>
              <Text style={styles.secondaryBtnText}>{t("completed.newExport")}</Text>
            </Pressable>
          </View>
        )}

        {/* Failed */}
        {(phase === "failed" || phase === "corrections-failed") && (
          <View style={styles.resultSection}>
            <Text style={styles.errorTitle}>
              {phase === "failed" ? t("failed.exportFailed") : t("failed.correctionsFailed")}
            </Text>
            {exportError && <Text style={styles.errorDetail}>{exportError}</Text>}
            <Pressable style={styles.secondaryBtn} onPress={handleReset}>
              <Text style={styles.secondaryBtnText}>{t("failed.reset")}</Text>
            </Pressable>
          </View>
        )}

        {/* Corrections completed */}
        {phase === "corrections-completed" && (
          <View style={styles.resultSection}>
            <Check size={48} color={colors.accent} />
            <Text style={styles.resultTitle}>{t("completed.correctionsApplied")}</Text>
            <Pressable style={styles.secondaryBtn} onPress={handleReset}>
              <Text style={styles.secondaryBtnText}>{t("failed.reset")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.rule },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.ink, textAlign: "center" },
  content: { padding: 16, gap: 12 },
  hero: { alignItems: "center", gap: 12, paddingVertical: 24 },
  heroTitle: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center" },
  heroDesc: { fontSize: 14, color: colors.inkMuted, textAlign: "center", lineHeight: 20 },
  errorBanner: { fontSize: 13, color: colors.error, backgroundColor: "rgba(192,57,43,0.08)", padding: 12, borderRadius: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.ink, marginTop: 8 },
  input: { fontSize: 15, color: colors.ink, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  langRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  langChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.rule },
  langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langChipText: { fontSize: 14, color: colors.inkMuted },
  langChipTextActive: { color: colors.primaryForeground },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  primaryBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryForeground },
  secondaryBtn: { borderWidth: 1, borderColor: colors.rule, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  secondaryBtnText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  btnDisabled: { opacity: 0.6 },
  pipelineSection: { alignItems: "center", gap: 12, paddingVertical: 32 },
  pipelineTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  pipelineDesc: { fontSize: 14, color: colors.inkMuted, textAlign: "center", lineHeight: 20 },
  stepsContainer: { width: "100%", gap: 12, marginTop: 16 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepText: { fontSize: 14, color: colors.inkMuted },
  stepDone: { color: colors.accent },
  stepActive: { color: colors.ink, fontWeight: "600" },
  resultSection: { alignItems: "center", gap: 16, paddingVertical: 48 },
  resultTitle: { fontSize: 22, fontWeight: "700", color: colors.ink },
  errorTitle: { fontSize: 20, fontWeight: "700", color: colors.error },
  errorDetail: { fontSize: 14, color: colors.inkMuted, textAlign: "center" },
});
