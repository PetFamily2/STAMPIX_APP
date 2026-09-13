import { resolveAppEnv, type AppEnv } from '@/config/appEnvironment';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legalUrls';

declare const __DEV__: boolean;

export const FORCE_PROD_MODE = false;
export type { AppEnv };
export const APP_ENV: AppEnv = resolveAppEnv({
  expoPublicAppEnv: process.env.EXPO_PUBLIC_APP_ENV,
  forceProdMode: FORCE_PROD_MODE,
  isDevRuntime: typeof __DEV__ !== 'undefined' && __DEV__,
});
export const IS_DEV_MODE = APP_ENV === 'dev';

const PAYMENT_SYSTEM_ENABLED_FLAG =
  process.env.EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED;
const MOCK_PAYMENTS_FLAG = process.env.EXPO_PUBLIC_MOCK_PAYMENTS;

export const PAYMENT_SYSTEM_ENABLED = PAYMENT_SYSTEM_ENABLED_FLAG === 'true';
export const MOCK_PAYMENTS = MOCK_PAYMENTS_FLAG === 'true';

export type BusinessPlan = 'starter' | 'pro' | 'premium';
export type BillingPeriod = 'monthly' | 'yearly';

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
};

export const REVENUECAT_PACKAGE_BY_PLAN_PERIOD: Record<
  BusinessPlan,
  Record<BillingPeriod, string | null>
> = {
  starter: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_STARTER_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_STARTER_YEARLY ?? null,
  },
  pro: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY ?? null,
  },
  premium: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY ?? null,
  },
};

const REVENUECAT_PACKAGE_IDS = Object.values(
  REVENUECAT_PACKAGE_BY_PLAN_PERIOD
).flatMap((packagesByPeriod) => Object.values(packagesByPeriod));

export const PRODUCTION_BILLING_FLAGS_AND_MAPPINGS_VALID =
  APP_ENV !== 'prod' ||
  !PAYMENT_SYSTEM_ENABLED ||
  (!MOCK_PAYMENTS &&
    process.env.EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED === 'true' &&
    REVENUECAT_PACKAGE_IDS.every(
      (packageId) => typeof packageId === 'string' && packageId.trim().length > 0
    ));

export const TERMS_URL = TERMS_OF_SERVICE_URL;
export const PRIVACY_URL = PRIVACY_POLICY_URL;
