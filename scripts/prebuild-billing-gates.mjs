#!/usr/bin/env bun
import { readFileSync } from 'node:fs';

import {
  FORBIDDEN_STARTER_COPY_PATTERNS,
  FORBIDDEN_V2_PLAN_COPY_PATTERNS,
  LOGICAL_SUBSCRIPTION_PRODUCTS,
  MVP_FEATURE_FLAGS,
  REFERRAL_CONTRACT,
  REVENUECAT_CANONICAL_ENTITLEMENT,
  assertFrozenPlanContract,
  planConfig,
} from '../convex/lib/billing/productionContract.ts';
import { CARD_THEMES } from '../constants/cardThemes.ts';

function fail(message) {
  console.error(`PREBUILD FAIL: ${message}`);
  process.exitCode = 1;
}

const profile = process.argv.includes('--production')
  ? 'production'
  : 'preview';

assertFrozenPlanContract();

if (LOGICAL_SUBSCRIPTION_PRODUCTS.length !== 6) {
  fail('six packages not defined');
}
if (REVENUECAT_CANONICAL_ENTITLEMENT !== 'business_access') {
  fail('business_access missing');
}
if (planConfig.starter.pricing.monthly <= 0) {
  fail('Starter price must be paid');
}
if (CARD_THEMES.length !== 10) {
  fail('Theme count != 10');
}
if (planConfig.premium.limits.maxCards > CARD_THEMES.length) {
  fail('Premium maxCards > Theme catalog count');
}
if (MVP_FEATURE_FLAGS.freeStarterEnabled) {
  fail('free Starter enabled');
}
if (REFERRAL_CONTRACT.referrerMonthlyRewardMonths !== 1) {
  fail('referrer monthly reward != 1');
}
if (REFERRAL_CONTRACT.referrerYearlyRewardMonths !== 2) {
  fail('referrer annual reward != 2');
}

const sources = [
  'convex/entitlements.ts',
  'convex/lib/billing/productMap.ts',
  'convex/businessReferralEngine.ts',
  'lib/subscription/planComparison.ts',
  'contexts/RevenueCatContext.tsx',
  'config/appConfig.ts',
  'components/subscription/SubscriptionSalesPanel.tsx',
  'components/subscription/UpgradeModal.tsx',
  'app/(auth)/paywall/index.tsx',
];
const blob = sources.map((path) => readFileSync(path, 'utf8')).join('\n');

if (blob.includes("Exclude<BusinessPlan, 'starter'>")) {
  fail('Starter excluded from RC mapping');
}
if (blob.includes('המשך עם Starter') || blob.includes('אפשר להמשיך עם Starter')) {
  fail('free Starter skip copy present');
}
if (blob.includes('subscriptionEndAt:') && blob.includes('grantMonths')) {
  fail('new referral reward patches subscriptionEndAt');
}
for (const pattern of FORBIDDEN_STARTER_COPY_PATTERNS) {
  if (blob.includes(pattern)) {
    fail(`forbidden starter copy: ${pattern}`);
  }
}
for (const pattern of FORBIDDEN_V2_PLAN_COPY_PATTERNS) {
  if (blob.includes(pattern)) {
    fail(`V2/בקרוב plan copy present: ${pattern}`);
  }
}

if (profile === 'production' || profile === 'preview') {
  if (process.env.EXPO_PUBLIC_MOCK_PAYMENTS === 'true') {
    fail('MOCK_PAYMENTS true in Preview or Production');
  }
  if (process.env.EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED === 'false') {
    fail('SERVER_AUTHORITATIVE_BILLING false');
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`prebuild:${profile} billing/referral gates passed`);
