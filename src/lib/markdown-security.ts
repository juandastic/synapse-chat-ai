import { harden } from "rehype-harden";

/**
 * Get the default origin based on the current environment
 */
function getDefaultOrigin(): string {
  if (import.meta.env.DEV) {
    // Development: use localhost with Vite's default port
    return "http://localhost:5173";
  }
  // Production: use your actual domain
  return "https://synapse.app";
}

/**
 * Security configuration for AI-generated content
 * More restrictive to protect against prompt injection attacks
 */
export const aiSecurityConfig = {
  defaultOrigin: getDefaultOrigin(),
  allowedLinkPrefixes: [
    getDefaultOrigin(), // Allow links to your own app
    "https://github.com",
    // Add other trusted domains as needed
  ],
  allowedImagePrefixes: [
    // Add your CDN domain if you have one
    // "https://your-cdn.com",
  ],
  allowedProtocols: ["http", "https", "mailto"],
  allowDataImages: false, // Disable base64 images for security
};

/**
 * Security configuration for user-generated content
 * Can be more permissive since users have more control
 */
export const userSecurityConfig = {
  defaultOrigin: getDefaultOrigin(),
  allowedLinkPrefixes: ["*"], // More permissive for user content
  allowedImagePrefixes: ["*"],
  allowedProtocols: ["*"],
  allowDataImages: true, // Allow data images for user content
};

/**
 * Get security configuration based on content type
 */
export function getSecurityConfig(isAIGenerated: boolean) {
  return isAIGenerated ? aiSecurityConfig : userSecurityConfig;
}

/**
 * Create rehype plugins with security hardening
 * Returns a tuple [plugin, config] as required by rehype
 */
export function createSecureRehypePlugins(isAIGenerated: boolean): [typeof harden, ReturnType<typeof getSecurityConfig>] {
  const config = getSecurityConfig(isAIGenerated);
  return [harden, config];
}
