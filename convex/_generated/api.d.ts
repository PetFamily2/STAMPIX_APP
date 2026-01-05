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
import type * as auth from "../auth.js";
import type * as business from "../business.js";
import type * as debug from "../debug.js";
import type * as events from "../events.js";
import type * as guards from "../guards.js";
import type * as http from "../http.js";
import type * as loyaltyPrograms from "../loyaltyPrograms.js";
import type * as memberships from "../memberships.js";
import type * as scanTokens from "../scanTokens.js";
import type * as scanner from "../scanner.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  auth: typeof auth;
  business: typeof business;
  debug: typeof debug;
  events: typeof events;
  guards: typeof guards;
  http: typeof http;
  loyaltyPrograms: typeof loyaltyPrograms;
  memberships: typeof memberships;
  scanTokens: typeof scanTokens;
  scanner: typeof scanner;
  seed: typeof seed;
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

export declare const components: {};
