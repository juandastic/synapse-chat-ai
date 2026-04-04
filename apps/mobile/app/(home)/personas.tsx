import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { useQuery, useMutation } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Id, Doc } from "@synapse/backend/dataModel";
import { Menu, Plus, Pencil, Trash2, ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureError } from "../../src/lib/analytics";

import { useColors } from "../../src/contexts/ThemeContext";
import { PersonaIcon } from "../../src/components/PersonaIcon";
import { IconPicker } from "../../src/components/IconPicker";

type ViewState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; persona: Doc<"personas"> };

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
];

export default function PersonasScreen() {
  const { t } = useTranslation("settings");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const personas = useQuery(api.personas.list);
  const createPersona = useMutation(api.personas.create);
  const updatePersona = useMutation(api.personas.update);
  const removePersona = useMutation(api.personas.remove);
  const colors = useColors();

  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.paper },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.rule,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.ink, textAlign: "center" },
    listContent: { padding: 16, gap: 12 },
    createCard: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.rule,
    },
    cardPressed: { backgroundColor: colors.accentLight },
    createLabel: { fontSize: 14, fontWeight: "600", color: colors.accent },
    emptyText: { fontSize: 14, color: colors.inkMuted, textAlign: "center", marginTop: 24, lineHeight: 20, paddingHorizontal: 16 },
    personaCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 16,
    },
    personaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    personaInfo: { flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    personaName: { fontSize: 15, fontWeight: "600", color: colors.ink, flexShrink: 1 },
    defaultBadge: { backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    defaultBadgeText: { fontSize: 10, fontWeight: "600", color: colors.accent },
    personaDesc: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
    personaActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
    actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center" },
    // Form
    formContent: { padding: 16, gap: 4, paddingBottom: 48 },
    formError: { fontSize: 13, color: colors.error, backgroundColor: colors.errorLight, padding: 12, borderRadius: 8, marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.ink, marginTop: 12, marginBottom: 4 },
    optional: { fontWeight: "400", color: colors.inkMuted },
    textInputField: { fontSize: 15, color: colors.ink, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 10 },
    promptInput: { minHeight: 160, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 },
    charCount: { fontSize: 11, color: colors.inkMuted, textAlign: "right", marginTop: 2 },
    langRow: { marginBottom: 4 },
    langChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.rule, marginRight: 8 },
    langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langChipText: { fontSize: 13, color: colors.inkMuted },
    langChipTextActive: { color: colors.primaryForeground },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryForeground },
  }), [colors]);

  const handleDelete = useCallback(
    (persona: Doc<"personas">) => {
      Alert.alert(
        t("personaSettings.deleteTitle", { name: persona.name }),
        t("personaSettings.deleteDescription"),
        [
          { text: t("personaSettings.understood"), style: "cancel" },
          {
            text: t("personaSettings.deleteTitle", { name: persona.name }).replace("?", ""),
            style: "destructive",
            onPress: async () => {
              try {
                await removePersona({ id: persona._id });
                posthog?.capture("persona_deleted_mobile", { persona_id: persona._id });
              } catch (err) {
                Alert.alert(
                  t("personaSettings.cannotDelete"),
                  t("personaSettings.personaInUse")
                );
                captureError(err, { source: "personas", action: "delete" });
              }
            },
          },
        ]
      );
    },
    [removePersona, t]
  );

  const handleSubmit = useCallback(
    async (data: { name: string; icon: string; language: string; description: string; systemPrompt: string }) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        if (view.mode === "create") {
          await createPersona({
            name: data.name,
            icon: data.icon,
            language: data.language,
            description: data.description || undefined,
            systemPrompt: data.systemPrompt,
          });
          posthog?.capture("persona_created_mobile", { name: data.name, language: data.language });
        } else if (view.mode === "edit") {
          await updatePersona({
            id: view.persona._id,
            name: data.name,
            icon: data.icon,
            language: data.language,
            description: data.description || undefined,
            systemPrompt: data.systemPrompt,
          });
          posthog?.capture("persona_edited_mobile", { persona_id: view.persona._id });
        }
        setView({ mode: "list" });
      } catch (err) {
        Alert.alert("Error", t("personaForm.submitError"));
        captureError(err, { source: "personas", action: view.mode });
      } finally {
        setIsSubmitting(false);
      }
    },
    [view, isSubmitting, createPersona, updatePersona, t]
  );

  if (view.mode === "create" || view.mode === "edit") {
    const initial = view.mode === "edit" ? view.persona : undefined;
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Pressable style={s.headerBtn} onPress={() => setView({ mode: "list" })}>
            <ChevronLeft size={22} color={colors.ink} />
          </Pressable>
          <Text style={s.headerTitle}>
            {view.mode === "create" ? t("personaSettings.createTitle") : t("personaSettings.editTitle")}
          </Text>
          <View style={s.headerBtn} />
        </View>
        <PersonaForm
          initial={initial}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel={view.mode === "create" ? t("personaSettings.createButton") : t("personaSettings.saveChanges")}
          s={s}
          colors={colors}
        />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable
          style={s.headerBtn}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        >
          <Menu size={22} color={colors.ink} />
        </Pressable>
        <Text style={s.headerTitle}>{t("personaSettings.title")}</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.listContent}>
        {/* Create new button */}
        <Pressable
          style={({ pressed }) => [s.createCard, pressed && s.cardPressed]}
          onPress={() => setView({ mode: "create" })}
        >
          <Plus size={24} color={colors.accent} />
          <Text style={s.createLabel}>{t("personaSettings.createNew")}</Text>
        </Pressable>

        {/* Loading */}
        {personas === undefined && (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        )}

        {/* Empty */}
        {personas && personas.length === 0 && (
          <Text style={s.emptyText}>{t("personaSettings.emptyState")}</Text>
        )}

        {/* Persona list */}
        {personas?.map((persona) => (
          <View key={persona._id} style={s.personaCard}>
            <View style={s.personaRow}>
              <PersonaIcon icon={persona.icon} size="md" />
              <View style={s.personaInfo}>
                <View style={s.nameRow}>
                  <Text style={s.personaName} numberOfLines={1}>{persona.name}</Text>
                  {persona.isDefault && (
                    <View style={s.defaultBadge}>
                      <Text style={s.defaultBadgeText}>{t("personaSettings.default")}</Text>
                    </View>
                  )}
                </View>
                {persona.description ? (
                  <Text style={s.personaDesc} numberOfLines={2}>{persona.description}</Text>
                ) : null}
              </View>
            </View>
            <View style={s.personaActions}>
              <Pressable
                style={s.actionBtn}
                onPress={() => setView({ mode: "edit", persona })}
              >
                <Pencil size={16} color={colors.inkMuted} />
              </Pressable>
              <Pressable
                style={s.actionBtn}
                onPress={() => handleDelete(persona)}
              >
                <Trash2 size={16} color={colors.error} />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PersonaForm({
  initial,
  onSubmit,
  isSubmitting,
  submitLabel,
  s,
  colors,
}: {
  initial?: Doc<"personas">;
  onSubmit: (data: { name: string; icon: string; language: string; description: string; systemPrompt: string }) => void;
  isSubmitting: boolean;
  submitLabel: string;
  s: any;
  colors: any;
}) {
  const { t } = useTranslation("settings");
  const [icon, setIcon] = useState(initial?.icon ?? "🤖");
  const [name, setName] = useState(initial?.name ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "en");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim()) { setError(t("personaForm.nameRequired")); return; }
    if (!systemPrompt.trim()) { setError(t("personaForm.promptRequired")); return; }
    setError(null);
    onSubmit({ name: name.trim(), icon, language, description: description.trim(), systemPrompt: systemPrompt.trim() });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
        {error && <Text style={s.formError}>{error}</Text>}

        {/* Icon */}
        <Text style={s.fieldLabel}>{t("personaForm.iconLabel")}</Text>
        <IconPicker value={icon} onChange={setIcon} />

        {/* Name */}
        <Text style={s.fieldLabel}>{t("personaForm.nameLabel")}</Text>
        <TextInput
          style={s.textInputField}
          value={name}
          onChangeText={setName}
          placeholder={t("personaForm.namePlaceholder")}
          placeholderTextColor={colors.inkMuted}
          maxLength={100}
        />

        {/* Language */}
        <Text style={s.fieldLabel}>{t("personaForm.languageLabel")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.langRow}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.value}
              style={[s.langChip, language === lang.value && s.langChipActive]}
              onPress={() => setLanguage(lang.value)}
            >
              <Text style={[s.langChipText, language === lang.value && s.langChipTextActive]}>
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Description */}
        <Text style={s.fieldLabel}>
          {t("personaForm.descriptionLabel")} <Text style={s.optional}>{t("personaForm.optional")}</Text>
        </Text>
        <TextInput
          style={[s.textInputField, { minHeight: 60 }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t("personaForm.descriptionPlaceholder")}
          placeholderTextColor={colors.inkMuted}
          multiline
          maxLength={500}
        />

        {/* System Prompt */}
        <Text style={s.fieldLabel}>{t("personaForm.systemPromptLabel")}</Text>
        <TextInput
          style={[s.textInputField, s.promptInput]}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          placeholder={t("personaForm.systemPromptPlaceholder")}
          placeholderTextColor={colors.inkMuted}
          multiline
          maxLength={10000}
        />
        <Text style={s.charCount}>
          {t("personaForm.characterCount", { count: systemPrompt.length })}
        </Text>

        {/* Submit */}
        <Pressable
          style={[s.submitBtn, isSubmitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.submitBtnText}>{submitLabel}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
