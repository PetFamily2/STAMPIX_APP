/**
 * Server-only PayPlus staging configuration.
 * Production is refused. Missing staging credentials disable live calls.
 */

export const PAYPLUS_STAGING_API_BASE =
  'https://restapidev.payplus.co.il/api/v1.0/';
export const PAYPLUS_STAGING_API_HOST = 'restapidev.payplus.co.il';
export const PAYPLUS_STAGING_PAGE_HOST = 'paymentsdev.payplus.co.il';
export const PAYPLUS_PRODUCTION_API_HOST = 'restapi.payplus.co.il';
export const PAYPLUS_PRODUCTION_PAGE_HOST = 'payments.payplus.co.il';

export const PAYPLUS_SERVER_ENV_NAMES = [
  'PAYPLUS_ENV',
  'PAYPLUS_API_KEY',
  'PAYPLUS_SECRET_KEY',
  'PAYPLUS_PAYMENT_PAGE_UID',
  'PAYPLUS_TERMINAL_UID',
  'PAYPLUS_CASHIER_UID',
  'PAYPLUS_WEB_ORIGIN',
  'CONVEX_SITE_URL',
] as const;

const CHECKOUT_REQUIRED = [
  'PAYPLUS_ENV',
  'PAYPLUS_API_KEY',
  'PAYPLUS_SECRET_KEY',
  'PAYPLUS_PAYMENT_PAGE_UID',
  'PAYPLUS_WEB_ORIGIN',
  'CONVEX_SITE_URL',
] as const;

export type PayPlusConfig = {
  env: 'disabled' | 'staging';
  liveCheckoutEnabled: boolean;
  liveRecurringAdminEnabled: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  secretKey: string | null;
  paymentPageUid: string | null;
  terminalUid: string | null;
  cashierUid: string | null;
  webOrigin: string | null;
  convexSiteUrl: string | null;
  missingCheckout: string[];
  missingRecurringAdmin: string[];
};

export function assertServerOnlyPayPlusEnvNames(): void {
  for (const name of PAYPLUS_SERVER_ENV_NAMES) {
    if (name.startsWith('EXPO_PUBLIC_')) {
      throw new Error('PAYPLUS_PUBLIC_ENV_FORBIDDEN');
    }
  }
}

function readTrimmed(
  env: Record<string, string | undefined>,
  key: string
): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function assertNotPayPlusProductionUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('PAYPLUS_URL_INVALID');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === PAYPLUS_PRODUCTION_API_HOST ||
    host === PAYPLUS_PRODUCTION_PAGE_HOST
  ) {
    throw new Error('PAYPLUS_PRODUCTION_FORBIDDEN');
  }
  return parsed;
}

export function resolvePayPlusConfig(
  env: Record<string, string | undefined> = {}
): PayPlusConfig {
  assertServerOnlyPayPlusEnvNames();
  const rawEnv = (env.PAYPLUS_ENV ?? '').trim().toLowerCase();
  if (rawEnv === 'production' || rawEnv === 'prod') {
    throw new Error('PAYPLUS_PRODUCTION_FORBIDDEN');
  }
  if (rawEnv !== '' && rawEnv !== 'disabled' && rawEnv !== 'staging') {
    throw new Error('PAYPLUS_ENV_INVALID');
  }

  const staging = rawEnv === 'staging';
  const values: Record<string, string | null> = {
    PAYPLUS_ENV: staging ? 'staging' : null,
    PAYPLUS_API_KEY: readTrimmed(env, 'PAYPLUS_API_KEY'),
    PAYPLUS_SECRET_KEY: readTrimmed(env, 'PAYPLUS_SECRET_KEY'),
    PAYPLUS_PAYMENT_PAGE_UID: readTrimmed(env, 'PAYPLUS_PAYMENT_PAGE_UID'),
    PAYPLUS_TERMINAL_UID: readTrimmed(env, 'PAYPLUS_TERMINAL_UID'),
    PAYPLUS_CASHIER_UID: readTrimmed(env, 'PAYPLUS_CASHIER_UID'),
    PAYPLUS_WEB_ORIGIN: readTrimmed(env, 'PAYPLUS_WEB_ORIGIN'),
    CONVEX_SITE_URL: readTrimmed(env, 'CONVEX_SITE_URL'),
  };

  const missingCheckout = CHECKOUT_REQUIRED.filter((key) => !values[key]);
  const missingRecurringAdmin = values.PAYPLUS_TERMINAL_UID
    ? [...missingCheckout]
    : [...missingCheckout, 'PAYPLUS_TERMINAL_UID'];
  const liveCheckoutEnabled = staging && missingCheckout.length === 0;
  const baseUrl = liveCheckoutEnabled ? PAYPLUS_STAGING_API_BASE : null;
  if (baseUrl) {
    const parsed = assertNotPayPlusProductionUrl(baseUrl);
    if (parsed.hostname !== PAYPLUS_STAGING_API_HOST) {
      throw new Error('PAYPLUS_STAGING_HOST_REQUIRED');
    }
  }

  return {
    env: staging ? 'staging' : 'disabled',
    liveCheckoutEnabled,
    liveRecurringAdminEnabled:
      liveCheckoutEnabled &&
      !missingRecurringAdmin.includes('PAYPLUS_TERMINAL_UID'),
    baseUrl,
    apiKey: liveCheckoutEnabled ? values.PAYPLUS_API_KEY : null,
    secretKey: staging ? values.PAYPLUS_SECRET_KEY : null,
    paymentPageUid: values.PAYPLUS_PAYMENT_PAGE_UID,
    terminalUid: values.PAYPLUS_TERMINAL_UID,
    cashierUid: values.PAYPLUS_CASHIER_UID,
    webOrigin: values.PAYPLUS_WEB_ORIGIN,
    convexSiteUrl: values.CONVEX_SITE_URL,
    missingCheckout: [...missingCheckout],
    missingRecurringAdmin,
  };
}

export function publicPayPlusConfigStatus(config: PayPlusConfig) {
  return {
    env: config.env,
    liveCheckoutEnabled: config.liveCheckoutEnabled,
    liveRecurringAdminEnabled: config.liveRecurringAdminEnabled,
    missingCheckout: config.missingCheckout,
    missingRecurringAdmin: config.missingRecurringAdmin,
  };
}

function normalizeOrigin(value: string): string {
  const parsed = assertNotPayPlusProductionUrl(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PAYPLUS_ORIGIN_INVALID');
  }
  const localhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const allowed =
    parsed.protocol === 'https:' || (parsed.protocol === 'http:' && localhost);
  if (!allowed || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error('PAYPLUS_ORIGIN_INVALID');
  }
  return parsed.origin;
}

export type PayPlusReturnUrls = {
  success: string;
  failure: string;
  cancel: string;
  callback: string;
};

export function buildPayPlusReturnUrls(args: {
  webOrigin: string;
  convexSiteUrl: string;
}): PayPlusReturnUrls {
  const web = normalizeOrigin(args.webOrigin);
  const site = normalizeOrigin(args.convexSiteUrl);
  return {
    success: `${web}/billing/payplus/success`,
    failure: `${web}/billing/payplus/failure`,
    cancel: `${web}/billing/payplus/cancel`,
    callback: `${site}/payplus/callback`,
  };
}
