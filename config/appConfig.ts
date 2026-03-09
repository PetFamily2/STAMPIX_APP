declare const __DEV__: boolean;

export const FORCE_PROD_MODE = false;
export const IS_DEV_MODE = FORCE_PROD_MODE ? false : __DEV__;

export type AppEnv = 'dev' | 'prod';
export const APP_ENV: AppEnv = IS_DEV_MODE ? 'dev' : 'prod';

export const PAYMENT_SYSTEM_ENABLED = false;
export const MOCK_PAYMENTS = false;

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

export const TERMS_URL = 'https://yourdomain.com/terms';
export const PRIVACY_URL = 'https://yourdomain.com/privacy';
