const isDevelopment = process.env.SYNAPSE_APP_VARIANT === "development";

const name = "Synapse";
const scheme = "synapse";
const bundleIdentifier = "com.synapse.mobile";

module.exports = {
  name: isDevelopment ? `${name} Dev` : name,
  slug: "synapse-mobile",
  version: "1.0.2",
  runtimeVersion: {
    policy: "appVersion",
  },
  icon: "./assets/icon.png",
  orientation: "portrait",
  scheme: isDevelopment ? `${scheme}-dev` : scheme,
  userInterfaceStyle: "automatic",
  updates: {
    url: "https://u.expo.dev/1dd9f32b-f7a4-4cf5-b61d-92770003dd3c",
  },
  ios: {
    bundleIdentifier: isDevelopment
      ? `${bundleIdentifier}.dev`
      : bundleIdentifier,
    supportsTablet: true,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Synapse needs access to your photos to attach images to messages.",
      NSLocalNetworkUsageDescription:
        "Synapse uses the local network to connect to the development server.",
      NSBonjourServices: ["_expo-cdc._tcp"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: isDevelopment
      ? `${bundleIdentifier}.dev`
      : bundleIdentifier,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#F5F0E8",
    },
    permissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    "@clerk/expo",
    "expo-asset",
    "expo-font",
    "expo-localization",
    "expo-router",
    "expo-secure-store",
    "expo-status-bar",
    "expo-system-ui",
    "expo-updates",
    "expo-web-browser",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Synapse needs access to your photos to attach images to messages.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "1dd9f32b-f7a4-4cf5-b61d-92770003dd3c",
    },
  },
  owner: "juandastic",
};
