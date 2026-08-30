/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as chat from "../chat.js";
import type * as cortex from "../cortex.js";
import type * as cortexConfig from "../cortexConfig.js";
import type * as cortexJobs from "../cortexJobs.js";
import type * as cortexProcessor from "../cortexProcessor.js";
import type * as demo from "../demo.js";
import type * as graph from "../graph.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as notion from "../notion.js";
import type * as notionConfig from "../notionConfig.js";
import type * as personas from "../personas.js";
import type * as plans from "../plans.js";
import type * as prompts from "../prompts.js";
import type * as r2 from "../r2.js";
import type * as seed_seedDemoData from "../seed/seedDemoData.js";
import type * as sessions from "../sessions.js";
import type * as threads from "../threads.js";
import type * as usage from "../usage.js";
import type * as usageLimits from "../usageLimits.js";
import type * as userKnowledgeCache from "../userKnowledgeCache.js";
import type * as userMemory from "../userMemory.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  chat: typeof chat;
  cortex: typeof cortex;
  cortexConfig: typeof cortexConfig;
  cortexJobs: typeof cortexJobs;
  cortexProcessor: typeof cortexProcessor;
  demo: typeof demo;
  graph: typeof graph;
  http: typeof http;
  messages: typeof messages;
  notion: typeof notion;
  notionConfig: typeof notionConfig;
  personas: typeof personas;
  plans: typeof plans;
  prompts: typeof prompts;
  r2: typeof r2;
  "seed/seedDemoData": typeof seed_seedDemoData;
  sessions: typeof sessions;
  threads: typeof threads;
  usage: typeof usage;
  usageLimits: typeof usageLimits;
  userKnowledgeCache: typeof userKnowledgeCache;
  userMemory: typeof userMemory;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
