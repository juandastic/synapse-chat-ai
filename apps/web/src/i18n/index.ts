import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// English
import enCommon from "./locales/en/common.json";
import enLanding from "./locales/en/landing.json";
import enChat from "./locales/en/chat.json";
import enSettings from "./locales/en/settings.json";
import enMemory from "./locales/en/memory.json";
import enNotion from "./locales/en/notion.json";
import enSidebar from "./locales/en/sidebar.json";

// Spanish
import esCommon from "./locales/es/common.json";
import esLanding from "./locales/es/landing.json";
import esChat from "./locales/es/chat.json";
import esSettings from "./locales/es/settings.json";
import esMemory from "./locales/es/memory.json";
import esNotion from "./locales/es/notion.json";
import esSidebar from "./locales/es/sidebar.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        landing: enLanding,
        chat: enChat,
        settings: enSettings,
        memory: enMemory,
        notion: enNotion,
        sidebar: enSidebar,
      },
      es: {
        common: esCommon,
        landing: esLanding,
        chat: esChat,
        settings: esSettings,
        memory: esMemory,
        notion: esNotion,
        sidebar: esSidebar,
      },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "synapse-lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
