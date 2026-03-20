/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiRecommendations from "../aiRecommendations.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as business from "../business.js";
import type * as campaigns from "../campaigns.js";
import type * as crons from "../crons.js";
import type * as customerCards from "../customerCards.js";
import type * as customerLifecycle from "../customerLifecycle.js";
import type * as debug from "../debug.js";
import type * as entitlements from "../entitlements.js";
import type * as events from "../events.js";
import type * as guards from "../guards.js";
import type * as http from "../http.js";
import type * as lib_campaignRuns from "../lib/campaignRuns.js";
import type * as lib_customerIntelligence from "../lib/customerIntelligence.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_recommendationUtils from "../lib/recommendationUtils.js";
import type * as lib_staffPermissions from "../lib/staffPermissions.js";
import type * as loyaltyPrograms from "../loyaltyPrograms.js";
import type * as memberships from "../memberships.js";
import type * as migrations_backfillBusinessPublicIds from "../migrations/backfillBusinessPublicIds.js";
import type * as migrations_backfillBusinessSubscriptions from "../migrations/backfillBusinessSubscriptions.js";
import type * as migrations_backfillLoyaltyProgramLifecycle from "../migrations/backfillLoyaltyProgramLifecycle.js";
import type * as migrations_backfillUserSubscriptionPlans from "../migrations/backfillUserSubscriptionPlans.js";
import type * as migrations_cutoverLegacyRetentionActions from "../migrations/cutoverLegacyRetentionActions.js";
import type * as migrations_migrateLegacySegmentCustomerStatus from "../migrations/migrateLegacySegmentCustomerStatus.js";
import type * as migrations_migrateRetentionActionLimitModel from "../migrations/migrateRetentionActionLimitModel.js";
import type * as migrations_migrateToOnboardingFlags from "../migrations/migrateToOnboardingFlags.js";
import type * as migrations_postCutoverValidation from "../migrations/postCutoverValidation.js";
import type * as onboarding from "../onboarding.js";
import type * as otp from "../otp.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as retention from "../retention.js";
import type * as scanTokens from "../scanTokens.js";
import type * as scanner from "../scanner.js";
import type * as seed from "../seed.js";
import type * as segments from "../segments.js";
import type * as support from "../support.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiRecommendations: typeof aiRecommendations;
  analytics: typeof analytics;
  auth: typeof auth;
  business: typeof business;
  campaigns: typeof campaigns;
  crons: typeof crons;
  customerCards: typeof customerCards;
  customerLifecycle: typeof customerLifecycle;
  debug: typeof debug;
  entitlements: typeof entitlements;
  events: typeof events;
  guards: typeof guards;
  http: typeof http;
  "lib/campaignRuns": typeof lib_campaignRuns;
  "lib/customerIntelligence": typeof lib_customerIntelligence;
  "lib/ids": typeof lib_ids;
  "lib/recommendationUtils": typeof lib_recommendationUtils;
  "lib/staffPermissions": typeof lib_staffPermissions;
  loyaltyPrograms: typeof loyaltyPrograms;
  memberships: typeof memberships;
  "migrations/backfillBusinessPublicIds": typeof migrations_backfillBusinessPublicIds;
  "migrations/backfillBusinessSubscriptions": typeof migrations_backfillBusinessSubscriptions;
  "migrations/backfillLoyaltyProgramLifecycle": typeof migrations_backfillLoyaltyProgramLifecycle;
  "migrations/backfillUserSubscriptionPlans": typeof migrations_backfillUserSubscriptionPlans;
  "migrations/cutoverLegacyRetentionActions": typeof migrations_cutoverLegacyRetentionActions;
  "migrations/migrateLegacySegmentCustomerStatus": typeof migrations_migrateLegacySegmentCustomerStatus;
  "migrations/migrateRetentionActionLimitModel": typeof migrations_migrateRetentionActionLimitModel;
  "migrations/migrateToOnboardingFlags": typeof migrations_migrateToOnboardingFlags;
  "migrations/postCutoverValidation": typeof migrations_postCutoverValidation;
  onboarding: typeof onboarding;
  otp: typeof otp;
  pushNotifications: typeof pushNotifications;
  retention: typeof retention;
  scanTokens: typeof scanTokens;
  scanner: typeof scanner;
  seed: typeof seed;
  segments: typeof segments;
  support: typeof support;
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
