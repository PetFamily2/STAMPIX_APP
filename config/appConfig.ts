import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legalUrls';

declare const __DEV__: boolean;

export const FORCE_PROD_MODE = false;
export const IS_DEV_MODE = FORCE_PROD_MODE ? false : __DEV__;

export type AppEnv = 'dev' | 'prod';
export const APP_ENV: AppEnv = IS_DEV_MODE ? 'dev' : 'prod';

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
  Exclude<BusinessPlan, 'starter'>,
  Record<BillingPeriod, string | null>
> = {
  pro: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY ?? null,
  },
  premium: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY ?? null,
  },
};

export const TERMS_URL = TERMS_OF_SERVICE_URL;
export const PRIVACY_URL = PRIVACY_POLICY_URL;
