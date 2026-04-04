/**
 * Home Screen — the main authenticated screen.
 *
 * Currently a placeholder with:
 *   - Header showing "Synapse" + user avatar (tappable)
 *   - Welcome message with user name and email
 *   - Profile modal (slide-up sheet) with "Manage account" and "Sign out"
 *
 * The avatar shows the user's Clerk profile image when available,
 * otherwise falls back to the first letter of their name/email.
 *
 * Sign-out is handled via Clerk's signOut() — the AuthGate in _layout.tsx
 * detects the session change and redirects back to /(auth) automatically.
 */
import { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Modal,
} from "react-native";
import { useAuth, useUser } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import { LogOut, Settings, X } from "lucide-react-native";

import { colors } from "../../src/constants/colors";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation("home");
  const [profileOpen, setProfileOpen] = useState(false);

  // Fallback initial when user has no profile photo
  const initials =
    user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ??
    "?";

  /** Sign out and close the modal. */
  const handleSignOut = () => {
    console.log("[Home] User tapped sign out");
    setProfileOpen(false);
    signOut();
  };

  return (
    <View style={styles.container}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("header")}</Text>

        {/* Avatar — opens the profile modal */}
        <Pressable
          style={styles.avatar}
          onPress={() => setProfileOpen(true)}
          accessibilityLabel="Open account menu"
        >
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </Pressable>
      </View>

      {/* ---- Main content (placeholder for future chat list) ---- */}
      <View style={styles.content}>
        <Text style={styles.greeting}>
          {t("welcome")}
          {user?.firstName ? `, ${user.firstName}` : ""}
        </Text>
        <Text style={styles.email}>
          {user?.emailAddresses[0]?.emailAddress}
        </Text>
      </View>

      {/* ---- Account modal (slide-up sheet) ---- */}
      <Modal
        visible={profileOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProfileOpen(false)}
      >
        <View style={styles.modalContainer}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("account.title")}</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => setProfileOpen(false)}
              accessibilityLabel="Close account menu"
            >
              <X size={18} color={colors.ink} />
            </Pressable>
          </View>

          {/* User info card */}
          <View style={styles.userInfo}>
            <View style={styles.avatarLarge}>
              {user?.imageUrl ? (
                <Image
                  source={{ uri: user.imageUrl }}
                  style={styles.avatarLargeImage}
                />
              ) : (
                <Text style={styles.avatarLargeText}>{initials}</Text>
              )}
            </View>
            <Text style={styles.userName}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={styles.userEmail}>
              {user?.emailAddresses[0]?.emailAddress}
            </Text>
          </View>

          {/* Action list */}
          <View style={styles.actionList}>
            <Pressable
              style={({ pressed }) => [
                styles.actionItem,
                pressed && styles.actionPressed,
              ]}
              onPress={() => {
                // TODO: navigate to a profile editing screen
                console.log("[Home] Manage account tapped (not implemented yet)");
                setProfileOpen(false);
              }}
            >
              <Settings size={20} color={colors.inkMuted} />
              <Text style={styles.actionText}>
                {t("account.manageAccount")}
              </Text>
            </Pressable>

            <View style={styles.actionDivider} />

            <Pressable
              style={({ pressed }) => [
                styles.actionItem,
                pressed && styles.actionPressed,
              ]}
              onPress={handleSignOut}
            >
              <LogOut size={20} color={colors.error} />
              <Text style={[styles.actionText, styles.actionDestructive]}>
                {t("account.signOut")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },

  /* Avatar (small — header) */
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontSize: 14, fontWeight: "700", color: colors.accent },

  /* Content */
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  email: { fontSize: 15, color: colors.inkMuted },

  /* Profile modal */
  modalContainer: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },

  /* User info (inside modal) */
  userInfo: {
    alignItems: "center",
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 16,
  },
  avatarLargeImage: { width: 72, height: 72, borderRadius: 36 },
  avatarLargeText: { fontSize: 28, fontWeight: "700", color: colors.accent },
  userName: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  userEmail: { fontSize: 14, color: colors.inkMuted },

  /* Action list (inside modal) */
  actionList: { paddingTop: 8 },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  actionPressed: { backgroundColor: colors.accentLight },
  actionText: { fontSize: 16, color: colors.ink },
  actionDestructive: { color: colors.error },
  actionDivider: { height: 1, backgroundColor: colors.rule, marginHorizontal: 24 },
});
