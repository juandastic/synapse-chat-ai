const baseConfig = require("./app.json").expo;

const isDevelopment = process.env.SYNAPSE_APP_VARIANT === "development";

module.exports = {
  ...baseConfig,
  name: isDevelopment ? `${baseConfig.name} Dev` : baseConfig.name,
  scheme: isDevelopment ? `${baseConfig.scheme}-dev` : baseConfig.scheme,
  ios: {
    ...baseConfig.ios,
    bundleIdentifier: isDevelopment
      ? `${baseConfig.ios.bundleIdentifier}.dev`
      : baseConfig.ios.bundleIdentifier,
  },
  android: {
    ...baseConfig.android,
    package: isDevelopment
      ? `${baseConfig.android.package}.dev`
      : baseConfig.android.package,
  },
};
