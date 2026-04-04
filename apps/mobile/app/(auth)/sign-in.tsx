/**
 * Sign-In Screen — handles all authentication methods.
 *
 * Three ways to sign in:
 *   1. Google OAuth  — opens a system browser sheet via expo-auth-session
 *   2. Email + password — two text inputs + the 3-step Clerk v3 flow
 *   3. Demo account  — one-tap login with pre-configured credentials
 *
 * After successful auth, the AuthGate in _layout.tsx detects the session
 * change and redirects to /(home) automatically.
 */
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSignIn, useSSO } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { Mail, ArrowLeft } from "lucide-react-native";

import { colors } from "../../src/constants/colors";

// Let expo-web-browser finish any pending OAuth redirect when the app reopens
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Demo credentials (optional — only shown when both env vars are set)
// ---------------------------------------------------------------------------

const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
const DEMO_AVAILABLE = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Basic email format check — not exhaustive, just catches obvious typos. */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignInScreen() {
  const { signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const { t } = useTranslation("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived state — the email submit button is only active when both fields
  // are filled and the email looks valid
  const canSubmitEmail = email.trim().length > 0 && password.length > 0 && isValidEmail(email);

  // -----------------------------------------------------------------------
  // Auth handlers
  // -----------------------------------------------------------------------

  /** Opens a system browser sheet for Google OAuth. */
  const handleGoogleSignIn = async () => {
    console.log("[SignIn] Starting Google OAuth flow...");
    setLoading("google");
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        console.log("[SignIn] Google sign-in successful, session:", createdSessionId);
      } else {
        // User dismissed the browser or flow was incomplete
        console.log("[SignIn] Google OAuth flow cancelled or incomplete");
      }
    } catch (err) {
      console.error("[SignIn] Google sign-in failed:", err);
      setError(t("signIn.errorGoogle"));
    } finally {
      setLoading(null);
    }
  };

  /**
   * Email + password sign-in using the Clerk v3 API:
   *   1. signIn.create({ identifier }) — start attempt
   *   2. signIn.password({ password }) — verify credentials
   *   3. signIn.finalize() — activate the session
   */
  const handleEmailSignIn = async () => {
    if (!signIn || !canSubmitEmail) return;

    console.log("[SignIn] Attempting email sign-in for:", email);
    setLoading("email");
    setError(null);

    try {
      await signIn.create({ identifier: email.trim() });
      const { error: pwError } = await signIn.password({ password });

      if (pwError) {
        console.warn("[SignIn] Password verification returned error:", pwError);
        setError(t("signIn.errorCredentials"));
        setLoading(null);
        return;
      }

      await signIn.finalize();
      console.log("[SignIn] Email sign-in successful");
    } catch (err) {
      console.error("[SignIn] Email sign-in failed:", err);
      setError(t("signIn.errorCredentials"));
      setLoading(null);
    }
  };

  /** One-tap demo login — same 3-step flow with pre-configured credentials. */
  const handleDemo = async () => {
    if (!signIn || !DEMO_EMAIL || !DEMO_PASSWORD) return;

    console.log("[SignIn] Starting demo sign-in...");
    setLoading("demo");
    setError(null);

    try {
      await signIn.create({ identifier: DEMO_EMAIL });
      await signIn.password({ password: DEMO_PASSWORD });
      await signIn.finalize();
      console.log("[SignIn] Demo sign-in successful");
    } catch (err) {
      console.error("[SignIn] Demo sign-in failed:", err);
      setError(t("signIn.errorDemo"));
      setLoading(null);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back → returns to onboarding carousel */}
        <Pressable style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>{t("signIn.title")}</Text>
        <Text style={styles.subtitle}>{t("signIn.subtitle")}</Text>

        {/* Error banner — only visible when something went wrong */}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* --- Google OAuth --- */}
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
          onPress={handleGoogleSignIn}
          disabled={loading !== null}
        >
          {loading === "google" ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleText}>{t("signIn.continueWithGoogle")}</Text>
            </>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("signIn.or")}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* --- Email + Password --- */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("signIn.emailLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("signIn.emailPlaceholder")}
            placeholderTextColor={colors.rule}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={loading === null}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("signIn.passwordLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("signIn.passwordPlaceholder")}
            placeholderTextColor={colors.rule}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            editable={loading === null}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            !canSubmitEmail && styles.disabled,
          ]}
          onPress={handleEmailSignIn}
          disabled={loading !== null || !canSubmitEmail}
        >
          {loading === "email" ? (
            <ActivityIndicator size="small" color={colors.paper} />
          ) : (
            <>
              <Mail size={18} color={colors.paper} strokeWidth={2} />
              <Text style={styles.primaryText}>{t("signIn.signInWithEmail")}</Text>
            </>
          )}
        </Pressable>

        {/* --- Demo account --- */}
        {DEMO_AVAILABLE && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t("signIn.or")}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}
              onPress={handleDemo}
              disabled={loading !== null}
            >
              {loading === "demo" ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Text style={styles.demoText}>{t("signIn.tryDemo")}</Text>
              )}
            </Pressable>
            <Text style={styles.demoNote}>{t("signIn.demoNote")}</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },

  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink, marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.inkMuted, marginBottom: 28 },

  error: {
    fontSize: 14,
    color: colors.error,
    backgroundColor: "rgba(192, 57, 43, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    overflow: "hidden",
  },

  /* Google button */
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 50,
    paddingVertical: 14,
  },
  googleIcon: { fontSize: 16, fontWeight: "700" },
  googleText: { fontSize: 15, fontWeight: "600", color: colors.ink },

  /* Divider */
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.rule },
  dividerText: { fontSize: 13, color: colors.inkMuted },

  /* Inputs */
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },

  /* Primary submit */
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 50,
    paddingVertical: 16,
  },
  primaryText: { fontSize: 15, fontWeight: "600", color: colors.paper },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },

  /* Demo button */
  demoButton: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: "center",
  },
  demoText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  demoNote: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: 8 },
});
