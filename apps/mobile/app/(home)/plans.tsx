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
} from "react-native";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { useQuery } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Menu, Zap, Sparkles, Heart, CheckCircle, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "../../src/contexts/ThemeContext";
import { SlideUpModal } from "../../src/components/SlideUpModal";

export default function PlansScreen() {
  const { t } = useTranslation("plans");
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const posthog = usePostHog();
  const user = useQuery(api.users.me);
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);
  const colors = useColors();

  const [contactModal, setContactModal] = useState<string | null>(null);

  const currentPlan = user?.plan ?? "free";
  const msgLimit = usageStatus?.dailyMessages;
  const isUnlimited = msgLimit?.limit === -1;

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.paper },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.rule },
    headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.ink, textAlign: "center" },
    usageText: { fontSize: 10, color: colors.inkMuted },
    content: { padding: 16, gap: 16, paddingBottom: 48 },
    tagline: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center" },
    description: { fontSize: 14, color: colors.inkMuted, textAlign: "center", lineHeight: 20 },
    planCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.rule, padding: 20, gap: 8, alignItems: "center" },
    planCardHighlighted: { borderColor: colors.accent, borderWidth: 2 },
    badge: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: "600", color: colors.primaryForeground },
    planName: { fontSize: 20, fontWeight: "700", color: colors.ink },
    planPrice: { fontSize: 16, fontWeight: "600", color: colors.accent },
    planDesc: { fontSize: 13, color: colors.inkMuted, textAlign: "center", lineHeight: 18 },
    featureList: { width: "100%", gap: 8, marginTop: 8 },
    featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    featureText: { fontSize: 13, color: colors.ink, flex: 1, lineHeight: 18 },
    currentBadge: { backgroundColor: colors.accentLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 8 },
    currentBadgeText: { fontSize: 13, fontWeight: "600", color: colors.accent },
    ctaBtn: { borderWidth: 1, borderColor: colors.rule, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, marginTop: 8 },
    ctaBtnHighlighted: { backgroundColor: colors.primary, borderColor: colors.primary },
    ctaBtnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
    ctaBtnTextHighlighted: { color: colors.primaryForeground },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    modalContent: { backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
    modalDesc: { fontSize: 14, color: colors.inkMuted },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.ink, marginTop: 4 },
    modalInput: { fontSize: 15, color: colors.ink, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 10, marginTop: 2 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
    submitBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryForeground },
    btnDisabled: { opacity: 0.6 },
  }), [colors]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Menu size={22} color={colors.ink} />
        </Pressable>
        <Text style={s.headerTitle}>{t("title")}</Text>
        <View style={s.headerBtn}>
          {!isUnlimited && msgLimit && (
            <Text style={s.usageText}>{t("usage", { used: msgLimit.used, limit: msgLimit.limit })}</Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.tagline}>{t("tagline")}</Text>
        <Text style={s.description}>{t("description")}</Text>

        {/* Free plan */}
        <PlanCard
          icon={<Zap size={24} color={colors.accent} />}
          name={t("free.name")}
          price={t("free.price")}
          description={t("free.description")}
          features={t("free.features", { returnObjects: true }) as string[]}
          isCurrent={currentPlan === "free"}
          ctaLabel={t("free.cta")}
          onCta={() => navigation.dispatch(DrawerActions.openDrawer())}
          currentPlanLabel={t("currentPlan")}
          s={s}
          colors={colors}
        />

        {/* Pro plan */}
        <PlanCard
          icon={<Sparkles size={24} color={colors.accent} />}
          name={t("pro.name")}
          price={t("pro.price")}
          description={t("pro.description")}
          features={t("pro.features", { returnObjects: true }) as string[]}
          isCurrent={currentPlan === "pro"}
          isHighlighted
          badge={t("pro.badge")}
          ctaLabel={t("pro.cta")}
          onCta={() => {
            posthog?.capture("pricing_plan_selected", { plan: "pro", source: "mobile" });
            setContactModal("Pro");
          }}
          currentPlanLabel={t("currentPlan")}
          s={s}
          colors={colors}
        />

        {/* Therapeutic plan */}
        <PlanCard
          icon={<Heart size={24} color={colors.accent} />}
          name={t("therapeutic.name")}
          price={t("therapeutic.price")}
          description={t("therapeutic.description")}
          features={t("therapeutic.features", { returnObjects: true }) as string[]}
          isCurrent={currentPlan === "unlimited"}
          ctaLabel={t("therapeutic.cta")}
          onCta={() => {
            posthog?.capture("pricing_plan_selected", { plan: "therapeutic", source: "mobile" });
            setContactModal("Therapeutic");
          }}
          currentPlanLabel={t("currentPlan")}
          s={s}
          colors={colors}
        />
      </ScrollView>

      {/* Contact Modal */}
      {contactModal && (
        <ContactModal
          planName={contactModal}
          userId={user?._id}
          onClose={() => setContactModal(null)}
          s={s}
          colors={colors}
        />
      )}
    </View>
  );
}

function PlanCard({
  icon,
  name,
  price,
  description,
  features,
  isCurrent,
  isHighlighted,
  badge,
  ctaLabel,
  onCta,
  currentPlanLabel,
  s,
  colors,
}: {
  icon: React.ReactNode;
  name: string;
  price: string;
  description: string;
  features: string[];
  isCurrent: boolean;
  isHighlighted?: boolean;
  badge?: string;
  ctaLabel: string;
  onCta: () => void;
  currentPlanLabel: string;
  s: any;
  colors: any;
}) {
  return (
    <View style={[s.planCard, isHighlighted && s.planCardHighlighted]}>
      {badge && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      )}
      {icon}
      <Text style={s.planName}>{name}</Text>
      <Text style={s.planPrice}>{price}</Text>
      <Text style={s.planDesc}>{description}</Text>

      <View style={s.featureList}>
        {features.map((feature, i) => (
          <View key={i} style={s.featureRow}>
            <CheckCircle size={14} color={colors.accent} />
            <Text style={s.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {isCurrent ? (
        <View style={s.currentBadge}>
          <Text style={s.currentBadgeText}>{currentPlanLabel}</Text>
        </View>
      ) : (
        <Pressable style={[s.ctaBtn, isHighlighted && s.ctaBtnHighlighted]} onPress={onCta}>
          <Text style={[s.ctaBtnText, isHighlighted && s.ctaBtnTextHighlighted]}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ContactModal({ planName, userId, onClose, s, colors }: { planName: string; userId?: string; onClose: () => void; s: any; colors: any }) {
  const { t } = useTranslation("plans");
  const posthog = usePostHog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setIsSending(true);

    posthog?.capture("contact_form_submitted", {
      plan: planName.toLowerCase(),
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      source: "mobile",
      ...(userId ? { user_id: userId } : {}),
    });

    await new Promise((r) => setTimeout(r, 300));
    setIsSending(false);
    Alert.alert("", t("contactModal.success"));
    onClose();
  }, [name, email, message, planName, userId, onClose, t, posthog]);

  return (
    <SlideUpModal visible onRequestClose={onClose} onBackdropPress={onClose}>
        <View style={s.modalContent}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t("contactModal.title")}</Text>
            <Pressable onPress={onClose}>
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={s.modalDesc}>{t("contactModal.description")}</Text>

          <Text style={s.fieldLabel}>{t("contactModal.nameLabel")}</Text>
          <TextInput style={s.modalInput} value={name} onChangeText={setName} placeholder={t("contactModal.namePlaceholder")} placeholderTextColor={colors.inkMuted} />

          <Text style={s.fieldLabel}>{t("contactModal.emailLabel")}</Text>
          <TextInput style={s.modalInput} value={email} onChangeText={setEmail} placeholder={t("contactModal.emailPlaceholder")} placeholderTextColor={colors.inkMuted} keyboardType="email-address" autoCapitalize="none" />

          <Text style={s.fieldLabel}>{t("contactModal.messageLabel")}</Text>
          <TextInput style={[s.modalInput, { minHeight: 80 }]} value={message} onChangeText={setMessage} placeholder={t("contactModal.messagePlaceholder")} placeholderTextColor={colors.inkMuted} multiline />

          <Pressable style={[s.submitBtn, isSending && s.btnDisabled]} onPress={handleSubmit} disabled={isSending}>
            {isSending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.submitBtnText}>{t("contactModal.submit")}</Text>}
          </Pressable>
        </View>
    </SlideUpModal>
  );
}
