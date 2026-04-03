/**
 * Central Cortex API configuration.
 * Change the base URL here to point to a different Cortex deployment.
 */
export const CORTEX_API_BASE_URL = "https://synapse-cortex.juandago.dev";

/** Shared Cortex hydration strategy toggle for all memory endpoints. */
export type HydrationVersion = "v1" | "v2";
export const HYDRATION_VERSION: HydrationVersion = "v2";

/**
 * Opaque pass-through object returned by Cortex hydration/ingest.
 * Keep this open so backend can add keys without frontend churn.
 */
export type CompilationMetadata = Record<string, unknown>;
