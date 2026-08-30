import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { useUser, useClerk } from "@clerk/expo";
import { usePostHog } from "posthog-react-native";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { Menu, ChevronRight, Trash2, ExternalLink } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "../../src/contexts/ThemeContext";

const PRIVACY_URL = "https://synapse-chat.juandago.dev/privacy";
const TERMS_URL = "https://synapse-chat.juandago.dev/terms";
const DELETE_URL = "https://synapse-chat.juandago.dev/delete-account";

export default function SettingsScreen() {
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const posthog = usePostHog();
  const { user } = useUser();
  const { signOut } = useClerk();
  const convexUser = useQuery(api.users.me);
  const colors = useColors();

  const [deleting, setDeleting] = useState(false);

  const isEs = i18n.language === "es";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.paper },
        header: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
        },
        headerBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
        },
        headerTitle: {
          flex: 1,
          fontSize: 18,
          fontWeight: "700",
          color: colors.ink,
          textAlign: "center",
        },
        content: { padding: 16, gap: 16, paddingBottom: 48 },
        sectionTitle: {
          fontSize: 12,
          fontWeight: "600",
          color: colors.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 8,
          marginBottom: 4,
          paddingHorizontal: 4,
        },
        card: {
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.rule,
          overflow: "hidden",
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 12,
        },
        rowSeparator: {
          height: 1,
          backgroundColor: colors.rule,
          marginLeft: 16,
        },
        rowLabel: { fontSize: 15, color: colors.ink, flex: 1 },
        rowValue: { fontSize: 14, color: colors.inkMuted },
        dangerCard: {
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.error,
          padding: 16,
          gap: 10,
        },
        dangerTitle: { fontSize: 15, fontWeight: "700", color: colors.error },
        dangerDesc: { fontSize: 13, color: colors.inkMuted, lineHeight: 18 },
        dangerBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: colors.error,
          backgroundColor: colors.errorLight ?? "rgba(185,28,28,0.08)",
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginTop: 6,
        },
        dangerBtnText: { fontSize: 14, fontWeight: "600", color: colors.error },
        rowPressed: { backgroundColor: colors.accentLight },
        pressed: { opacity: 0.7 },
      }),
    [colors]
  );

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        isEs ? "No se pudo abrir el link" : "Couldn't open link",
        url
      );
    }
  }, [isEs]);

  const handleDeleteAccount = useCallback(() => {
    if (deleting) return;
    Alert.alert(
      isEs ? "¿Eliminar tu cuenta?" : "Delete your account?",
      isEs
        ? "Esto eliminará permanentemente todos tus hilos, mensajes, imágenes, grafo de memoria y preferencias dentro de 30 días. Esta acción no se puede deshacer."
        : "This will permanently delete all your threads, messages, images, memory graph, and preferences within 30 days. This cannot be undone.",
      [
        { text: isEs ? "Cancelar" : "Cancel", style: "cancel" },
        {
          text: isEs ? "Eliminar" : "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            posthog?.capture("account_deletion_requested", {
              user_id: convexUser?._id ?? null,
              email,
              requested_at: Date.now(),
              source: "mobile",
            });

            await new Promise((r) => setTimeout(r, 800));

            Alert.alert(
              isEs ? "Solicitud enviada" : "Request submitted",
              isEs
                ? "Tu cuenta se eliminará dentro de 30 días. Cerrando sesión ahora."
                : "Your account will be deleted within 30 days. Signing you out now.",
              [
                {
                  text: "OK",
                  onPress: async () => {
                    try {
                      await signOut();
                    } catch {
                      /* ignore */
                    }
                    router.replace("/(auth)" as never);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [deleting, isEs, posthog, convexUser?._id, email, signOut, router]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable
          style={s.headerBtn}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        >
          <Menu size={22} color={colors.ink} />
        </Pressable>
        <Text style={s.headerTitle}>
          {isEs ? "Cuenta" : "Account"}
        </Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Profile */}
        <Text style={s.sectionTitle}>{isEs ? "Perfil" : "Profile"}</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {email}
            </Text>
          </View>
          <View style={s.rowSeparator} />
          <View style={s.row}>
            <Text style={s.rowLabel}>
              {isEs ? "Nombre" : "Name"}
            </Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {convexUser?.name ?? "—"}
            </Text>
          </View>
          <View style={s.rowSeparator} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Plan</Text>
            <Text style={[s.rowValue, { textTransform: "capitalize" }]}>
              {convexUser?.plan ?? "free"}
            </Text>
          </View>
        </View>

        {/* Legal */}
        <Text style={s.sectionTitle}>Legal</Text>
        <View style={s.card}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            onPress={() => handleOpenUrl(PRIVACY_URL)}
          >
            <Text style={s.rowLabel}>
              {isEs ? "Política de Privacidad" : "Privacy Policy"}
            </Text>
            <ExternalLink size={16} color={colors.inkMuted} />
          </Pressable>
          <View style={s.rowSeparator} />
          <Pressable
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            onPress={() => handleOpenUrl(TERMS_URL)}
          >
            <Text style={s.rowLabel}>
              {isEs ? "Términos de Servicio" : "Terms of Service"}
            </Text>
            <ExternalLink size={16} color={colors.inkMuted} />
          </Pressable>
          <View style={s.rowSeparator} />
          <Pressable
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            onPress={() => handleOpenUrl(DELETE_URL)}
          >
            <Text style={s.rowLabel}>
              {isEs ? "Política de eliminación" : "Deletion policy"}
            </Text>
            <ExternalLink size={16} color={colors.inkMuted} />
          </Pressable>
        </View>

        {/* Sign out */}
        <Text style={s.sectionTitle}>{isEs ? "Sesión" : "Session"}</Text>
        <View style={s.card}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            onPress={async () => {
              try {
                await signOut();
                router.replace("/(auth)" as never);
              } catch {
                /* ignore */
              }
            }}
          >
            <Text style={s.rowLabel}>
              {isEs ? "Cerrar sesión" : "Sign out"}
            </Text>
            <ChevronRight size={16} color={colors.inkMuted} />
          </Pressable>
        </View>

        {/* Danger zone */}
        <Text style={s.sectionTitle}>
          {isEs ? "Zona peligrosa" : "Danger zone"}
        </Text>
        <View style={s.dangerCard}>
          <Text style={s.dangerTitle}>
            {isEs ? "Eliminar mi cuenta" : "Delete my account"}
          </Text>
          <Text style={s.dangerDesc}>
            {isEs
              ? "Eliminar tu cuenta borra permanentemente tus hilos, mensajes, imágenes y grafo de memoria dentro de 30 días. Esta acción no se puede deshacer."
              : "Deleting your account permanently removes your threads, messages, images, and memory graph within 30 days. This cannot be undone."}
          </Text>
          <Pressable
            style={({ pressed }) => [s.dangerBtn, pressed && s.pressed]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <>
                <Trash2 size={16} color={colors.error} />
                <Text style={s.dangerBtnText}>
                  {isEs ? "Eliminar mi cuenta" : "Delete my account"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
