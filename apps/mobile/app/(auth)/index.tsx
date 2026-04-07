/**
 * Onboarding Screen — the first thing users see before signing in.
 *
 * A horizontal paging carousel with 6 slides:
 *   1. Welcome     — hook + before/after chat comparison
 *   2. Pipeline    — 4-step "how it works" (Converse → Ingest → Compile → Evolve)
 *   3. Compass     — therapeutic persona card
 *   4. Solace      — wellbeing persona card
 *   5. Momentum    — growth coach persona card
 *   6. CTA         — "Get started" (→ sign-in) and "Try demo" buttons
 *
 * All text comes from i18n ("onboarding" namespace) so it works in EN and ES.
 * The language toggle (top-right) switches the entire app language on the fly.
 */
import { useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  ViewToken,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSignIn, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { StatusBar } from "expo-status-bar";
import {
  Compass,
  Leaf,
  Zap,
  Sparkles,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { captureError } from "../../src/lib/analytics";

import { useColors } from "../../src/contexts/ThemeContext";
import { IconBadge, Tag, UseCase, ChatBubble } from "../../src/components";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
const DEMO_AVAILABLE = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

/** Step numbers displayed next to each pipeline item. */
const STEP_NUMS = ["01", "02", "03", "04"];

/** Matches SLIDES order — used for analytics only. */
const SLIDE_NAMES = ["welcome", "pipeline", "compass", "solace", "momentum", "cta"];

// ---------------------------------------------------------------------------
// Slide data — defines the order and type of each carousel page
// ---------------------------------------------------------------------------

type SlideData =
  | { type: "welcome" }
  | { type: "pipeline" }
  | { type: "persona"; personaKey: string; icon: LucideIcon }
  | { type: "cta" };

const PERSONA_DEFS: { key: string; icon: LucideIcon }[] = [
  { key: "compass", icon: Compass },
  { key: "solace", icon: Leaf },
  { key: "momentum", icon: Zap },
];

const SLIDES: SlideData[] = [
  { type: "welcome" },
  { type: "pipeline" },
  ...PERSONA_DEFS.map((p) => ({
    type: "persona" as const,
    personaKey: p.key,
    icon: p.icon,
  })),
  { type: "cta" },
];

// ---------------------------------------------------------------------------
// Shared styles hook
// ---------------------------------------------------------------------------

function useScreenStyles() {
  const colors = useColors();
  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },

    /* Language toggle */
    langToggle: {
      position: "absolute",
      top: 54,
      right: 24,
      zIndex: 10,
      backgroundColor: colors.accentLight,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    langToggleText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      color: colors.accent,
    },

    /* Slide layout */
    slideScroll: { flex: 1 },
    slideScrollContent: { paddingHorizontal: 32, paddingTop: 80, paddingBottom: 24 },

    /* Typography */
    tagline: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 3,
      color: colors.accent,
      marginBottom: 10,
    },
    title: {
      fontSize: 30,
      fontWeight: "700",
      color: colors.ink,
      lineHeight: 38,
      marginBottom: 14,
    },
    description: {
      fontSize: 15,
      lineHeight: 23,
      color: colors.inkMuted,
      marginBottom: 24,
    },

    /* Comparison */
    comparisonContainer: { marginTop: 4, gap: 16 },
    comparisonSection: { gap: 8 },
    comparisonLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2,
      color: colors.inkMuted,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    comparisonDivider: { height: 1, backgroundColor: colors.rule },

    /* Pipeline */
    pipelineList: { gap: 16 },
    pipelineStep: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
    pipelineNum: { fontSize: 13, fontWeight: "700", color: colors.accent, width: 24, paddingTop: 2 },
    pipelineBody: { flex: 1 },
    pipelineTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 3 },
    pipelineDesc: { fontSize: 14, lineHeight: 20, color: colors.inkMuted },

    /* Persona slides */
    personaHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
    personaHeaderText: { flex: 1 },
    personaName: { fontSize: 24, fontWeight: "700", color: colors.ink },
    personaSubtitle: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
    personaApproach: { fontSize: 15, lineHeight: 23, color: colors.inkMuted, marginBottom: 24 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 2, color: colors.accent, marginBottom: 10 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
    useCaseList: { gap: 12 },

    /* CTA slide */
    ctaContainer: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
    ctaButtons: { gap: 12 },
    demoButton: {
      backgroundColor: colors.accentLight,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 50,
      paddingVertical: 16,
      paddingHorizontal: 48,
      width: "100%",
      alignItems: "center",
    },
    demoButtonText: { color: colors.ink, fontSize: 16, fontWeight: "600" },
    demoNote: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: 4 },
    ctaFooter: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: 32 },

    /* Bottom controls */
    bottom: { paddingHorizontal: 32, paddingBottom: 50, paddingTop: 12, alignItems: "center", gap: 14 },
    dots: { flexDirection: "row", gap: 8, marginBottom: 4 },
    dot: { height: 8, borderRadius: 4 },
    dotActive: { backgroundColor: colors.accent, width: 24 },
    dotInactive: { backgroundColor: colors.rule, width: 8 },
    button: {
      backgroundColor: colors.ink,
      borderRadius: 50,
      paddingVertical: 16,
      paddingHorizontal: 48,
      width: "100%",
      alignItems: "center",
    },
    buttonPressed: { opacity: 0.85 },
    buttonText: { color: colors.paper, fontSize: 16, fontWeight: "600" },
    skip: { color: colors.inkMuted, fontSize: 14 },
  }), [colors]);

  return { s, colors };
}

// ---------------------------------------------------------------------------
// Slide components — each renders inside a full-width FlatList page
// ---------------------------------------------------------------------------

/** Slide 1: hero copy + Regular AI vs Synapse chat comparison. */
function WelcomeSlide() {
  const { t } = useTranslation("onboarding");
  const { s } = useScreenStyles();
  return (
    <ScrollView
      style={s.slideScroll}
      contentContainerStyle={s.slideScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.title}>{t("welcome.title")}</Text>
      <Text style={s.description}>{t("welcome.description")}</Text>

      {/* Side-by-side chat comparison showing the value of memory */}
      <View style={s.comparisonContainer}>
        <View style={s.comparisonSection}>
          <Text style={s.comparisonLabel}>{t("welcome.regularAI")}</Text>
          <ChatBubble role="user" text={t("welcome.regularUser")} muted />
          <ChatBubble role="ai" text={t("welcome.regularBot")} muted />
        </View>
        <View style={s.comparisonDivider} />
        <View style={s.comparisonSection}>
          <Text style={s.comparisonLabel}>{t("welcome.synapse")}</Text>
          <ChatBubble role="user" text={t("welcome.synapseUser")} />
          <ChatBubble role="ai" text={t("welcome.synapseBot")} />
        </View>
      </View>
    </ScrollView>
  );
}

/** Slide 2: four-step pipeline (Converse → Ingest → Compile → Evolve). */
function PipelineSlide() {
  const { t } = useTranslation("onboarding");
  const { s } = useScreenStyles();
  const steps = t("pipeline.steps", { returnObjects: true }) as Array<{
    title: string;
    desc: string;
  }>;

  return (
    <ScrollView
      style={s.slideScroll}
      contentContainerStyle={s.slideScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.tagline}>{t("pipeline.tagline")}</Text>
      <Text style={s.title}>{t("pipeline.title")}</Text>
      <Text style={s.description}>{t("pipeline.description")}</Text>

      <View style={s.pipelineList}>
        {steps.map((step, i) => (
          <View key={i} style={s.pipelineStep}>
            <Text style={s.pipelineNum}>{STEP_NUMS[i]}</Text>
            <View style={s.pipelineBody}>
              <Text style={s.pipelineTitle}>{step.title}</Text>
              <Text style={s.pipelineDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Slides 3-5: one per persona (Compass, Solace, Momentum). */
function PersonaSlide({
  personaKey,
  icon,
}: {
  personaKey: string;
  icon: LucideIcon;
}) {
  const { t } = useTranslation("onboarding");
  const { s } = useScreenStyles();
  const prefix = `personas.${personaKey}`;
  const theories = t(`${prefix}.theories`, { returnObjects: true }) as string[];
  const useCases = t(`${prefix}.useCases`, { returnObjects: true }) as string[];

  return (
    <ScrollView
      style={s.slideScroll}
      contentContainerStyle={s.slideScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Persona header: icon + name + subtitle */}
      <View style={s.personaHeader}>
        <IconBadge icon={icon} />
        <View style={s.personaHeaderText}>
          <Text style={s.personaName}>{t(`${prefix}.name`)}</Text>
          <Text style={s.personaSubtitle}>
            {t(`${prefix}.subtitle`)}
          </Text>
        </View>
      </View>

      <Text style={s.personaApproach}>{t(`${prefix}.approach`)}</Text>

      {/* Theoretical foundations as pill tags */}
      <Text style={s.sectionLabel}>
        {t("personas.theoreticalFoundations")}
      </Text>
      <View style={s.tagRow}>
        {theories.map((th, i) => (
          <Tag key={i} label={th} />
        ))}
      </View>

      {/* Key use cases with checkmark icons */}
      <Text style={s.sectionLabel}>{t("personas.perfectFor")}</Text>
      <View style={s.useCaseList}>
        {useCases.map((uc, i) => (
          <UseCase key={i} text={uc} />
        ))}
      </View>
    </ScrollView>
  );
}

/** Slide 6: final CTA with "Get started" and "Try demo" buttons. */
function CTASlide({
  onSignIn,
  onDemo,
  demoLoading,
}: {
  onSignIn: () => void;
  onDemo: () => void;
  demoLoading: boolean;
}) {
  const { t } = useTranslation("onboarding");
  const { s, colors } = useScreenStyles();

  return (
    <View style={s.ctaContainer}>
      <IconBadge icon={Sparkles} />
      <Text style={s.tagline}>{t("cta.tagline")}</Text>
      <Text style={s.title}>{t("cta.title")}</Text>
      <Text style={s.description}>{t("cta.description")}</Text>

      <View style={s.ctaButtons}>
        <Pressable
          style={({ pressed }) => [
            s.button,
            pressed && s.buttonPressed,
          ]}
          onPress={onSignIn}
        >
          <Text style={s.buttonText}>{t("cta.getStarted")}</Text>
        </Pressable>

        {DEMO_AVAILABLE && (
          <Pressable
            style={({ pressed }) => [
              s.demoButton,
              pressed && s.buttonPressed,
            ]}
            onPress={onDemo}
            disabled={demoLoading}
          >
            {demoLoading ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Text style={s.demoButtonText}>{t("cta.tryDemo")}</Text>
            )}
          </Pressable>
        )}

        {DEMO_AVAILABLE && (
          <Text style={s.demoNote}>{t("cta.demoNote")}</Text>
        )}
      </View>

      <Text style={s.ctaFooter}>
        {t("cta.personal")} {t("cta.openSource")}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const { signIn } = useSignIn();
  const { signOut, isSignedIn } = useAuth();
  const { t, i18n } = useTranslation("onboarding");
  const router = useRouter();
  const posthog = usePostHog();
  const { s } = useScreenStyles();

  const [activeIndex, setActiveIndex] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Track which slide is currently visible (used for dots + bottom controls)
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const idx = viewableItems[0].index;
        setActiveIndex(idx);
        posthog?.capture("onboarding_slide_viewed", {
          slide_index: idx,
          slide_name: SLIDE_NAMES[idx],
        });
      }
    },
    [posthog]
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const isLastSlide = activeIndex === SLIDES.length - 1;

  /** Advance carousel to the next slide. */
  const handleNext = () => {
    if (isLastSlide) return;
    flatListRef.current?.scrollToIndex({
      index: activeIndex + 1,
      animated: true,
    });
  };

  /** Navigate to the full sign-in screen (Google + email + password). */
  const handleSignIn = () => {
    console.log("[Onboarding] User tapped 'Get started' → navigating to sign-in");
    posthog?.capture("onboarding_completed", { method: "sign_in" });
    router.push("/(auth)/sign-in");
  };

  /**
   * Sign in with the pre-configured demo account.
   * If already signed in (e.g. stale session), signs out first.
   * Uses the 3-step Clerk v3 flow: create → password → finalize.
   */
  const handleDemo = async () => {
    if (!signIn || !DEMO_EMAIL || !DEMO_PASSWORD) return;
    console.log("[Onboarding] Starting demo sign-in...");
    setDemoLoading(true);
    try {
      // Clear any stale session before creating a new one
      if (isSignedIn) {
        console.log("[Onboarding] Clearing existing session before demo login");
        await signOut();
      }
      await signIn.create({ identifier: DEMO_EMAIL });
      await signIn.password({ password: DEMO_PASSWORD });
      await signIn.finalize();
      console.log("[Onboarding] Demo sign-in successful");
      posthog?.capture("onboarding_completed", { method: "demo" });
    } catch (error) {
      console.error("[Onboarding] Demo sign-in failed:", error);
      captureError(error, { source: "onboarding_demo_sign_in" });
      setDemoLoading(false);
    }
  };

  /** Toggle between English and Spanish. */
  const toggleLanguage = () => {
    const next = i18n.language === "es" ? "en" : "es";
    console.log(`[Onboarding] Language changed to ${next}`);
    posthog?.capture("language_toggled", { language: next });
    i18n.changeLanguage(next);
  };

  return (
    <View style={s.container}>
      <StatusBar style="dark" />

      {/* Language toggle — top right, always visible */}
      <Pressable style={s.langToggle} onPress={toggleLanguage}>
        <Text style={s.langToggleText}>
          {i18n.language === "es" ? "EN" : "ES"}
        </Text>
      </Pressable>

      {/* Horizontal paging carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH }}>
            {item.type === "welcome" && <WelcomeSlide />}
            {item.type === "pipeline" && <PipelineSlide />}
            {item.type === "persona" && (
              <PersonaSlide personaKey={item.personaKey} icon={item.icon} />
            )}
            {item.type === "cta" && (
              <CTASlide
                onSignIn={handleSignIn}
                onDemo={handleDemo}
                demoLoading={demoLoading}
              />
            )}
          </View>
        )}
      />

      {/* Bottom navigation — hidden on CTA slide (it has its own buttons) */}
      {!isLastSlide && (
        <View style={s.bottom}>
          {/* Pagination dots */}
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i === activeIndex ? s.dotActive : s.dotInactive,
                ]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              s.button,
              pressed && s.buttonPressed,
            ]}
            onPress={handleNext}
          >
            <Text style={s.buttonText}>{t("nav.next")}</Text>
          </Pressable>

          {/* Skip jumps directly to the CTA slide */}
          <Pressable
            onPress={() => {
              posthog?.capture("onboarding_skipped", { from_slide: activeIndex });
              flatListRef.current?.scrollToIndex({
                index: SLIDES.length - 1,
                animated: true,
              });
            }}
          >
            <Text style={s.skip}>{t("nav.skip")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
