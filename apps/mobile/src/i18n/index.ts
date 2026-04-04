import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Platform, NativeModules } from "react-native";

import enOnboarding from "./locales/en/onboarding.json";
import enAuth from "./locales/en/auth.json";
import enHome from "./locales/en/home.json";
import esOnboarding from "./locales/es/onboarding.json";
import esAuth from "./locales/es/auth.json";
import esHome from "./locales/es/home.json";

const deviceLocale =
  Platform.OS === "ios"
    ? NativeModules.SettingsManager?.settings?.AppleLocale ??
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
    : NativeModules.I18nManager?.localeIdentifier;

const deviceLang = deviceLocale?.split(/[-_]/)[0] ?? "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { onboarding: enOnboarding, auth: enAuth, home: enHome },
    es: { onboarding: esOnboarding, auth: esAuth, home: esHome },
  },
  lng: deviceLang,
  fallbackLng: "en",
  supportedLngs: ["en", "es"],
  defaultNS: "onboarding",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
