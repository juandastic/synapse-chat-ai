import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Platform, NativeModules } from "react-native";

import enOnboarding from "./locales/en/onboarding.json";
import enAuth from "./locales/en/auth.json";
import enHome from "./locales/en/home.json";
import enChat from "./locales/en/chat.json";
import enSidebar from "./locales/en/sidebar.json";
import enSettings from "./locales/en/settings.json";
import enMemory from "./locales/en/memory.json";
import enNotion from "./locales/en/notion.json";
import enPlans from "./locales/en/plans.json";
import esOnboarding from "./locales/es/onboarding.json";
import esAuth from "./locales/es/auth.json";
import esHome from "./locales/es/home.json";
import esChat from "./locales/es/chat.json";
import esSidebar from "./locales/es/sidebar.json";
import esSettings from "./locales/es/settings.json";
import esMemory from "./locales/es/memory.json";
import esNotion from "./locales/es/notion.json";
import esPlans from "./locales/es/plans.json";

const deviceLocale =
  Platform.OS === "ios"
    ? NativeModules.SettingsManager?.settings?.AppleLocale ??
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
    : NativeModules.I18nManager?.localeIdentifier;

const deviceLang = deviceLocale?.split(/[-_]/)[0] ?? "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { onboarding: enOnboarding, auth: enAuth, home: enHome, chat: enChat, sidebar: enSidebar, settings: enSettings, memory: enMemory, notion: enNotion, plans: enPlans },
    es: { onboarding: esOnboarding, auth: esAuth, home: esHome, chat: esChat, sidebar: esSidebar, settings: esSettings, memory: esMemory, notion: esNotion, plans: esPlans },
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
