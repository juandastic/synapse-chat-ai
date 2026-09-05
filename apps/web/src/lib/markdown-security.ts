import { harden } from "rehype-harden";

const defaultOrigin = import.meta.env.DEV
  ? "http://localhost:5173"
  : "https://synapse.app";

const aiSecurityConfig = {
  defaultOrigin,
  allowedLinkPrefixes: [defaultOrigin, "https://github.com"],
  allowedImagePrefixes: [],
  allowedProtocols: ["http", "https", "mailto"],
  allowDataImages: false,
};

export const secureRehypePlugin: [typeof harden, typeof aiSecurityConfig] = [
  harden,
  aiSecurityConfig,
];
