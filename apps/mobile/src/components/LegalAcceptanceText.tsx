import { useMemo } from "react";
import { Text, Linking, StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { useColors } from "../contexts/ThemeContext";

const TERMS_URL = "https://synapse-chat.juandago.dev/terms";
const PRIVACY_URL = "https://synapse-chat.juandago.dev/privacy";

interface Props {
  style?: StyleProp<TextStyle>;
}

/**
 * Signup disclosure shown on the mobile auth screen. Renders minimum-age +
 * Terms + Privacy acceptance language with inline links that open the legal
 * pages in the system browser.
 */
export function LegalAcceptanceText({ style }: Props) {
  const { i18n } = useTranslation();
  const colors = useColors();
  const isEs = i18n.language === "es";

  const s = useMemo(
    () =>
      StyleSheet.create({
        note: {
          fontSize: 11,
          color: colors.inkMuted,
          textAlign: "center",
          marginTop: 24,
          lineHeight: 16,
        },
        link: {
          color: colors.accent,
          textDecorationLine: "underline",
        },
      }),
    [colors]
  );

  const terms = (
    <Text style={s.link} onPress={() => Linking.openURL(TERMS_URL)}>
      {isEs ? "Términos" : "Terms"}
    </Text>
  );
  const privacy = (
    <Text style={s.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
      {isEs ? "Política de Privacidad" : "Privacy Policy"}
    </Text>
  );

  return (
    <Text style={[s.note, style]}>
      {isEs ? (
        <>Al registrarte, debes tener al menos 13 años y aceptas los {terms} y la {privacy}.</>
      ) : (
        <>By signing up, you must be at least 13 years old and you agree to the {terms} and {privacy}.</>
      )}
    </Text>
  );
}
