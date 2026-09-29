import {
  LOGICAL_SUBSCRIPTION_PRODUCTS,
  type LogicalSubscriptionProductId,
} from '../productionContract';

export const SUMIT_API_BASE = 'https://api.sumit.co.il/';
export const SUMIT_API_HOST = 'api.sumit.co.il';

export const SUMIT_SERVER_ENV_NAMES = [
  'SUMIT_ENV',
  'SUMIT_COMPANY_ID',
  'SUMIT_API_KEY',
  'SUMIT_WEB_ORIGIN',
  'SUMIT_PRODUCTS_JSON',
] as const;

export type SumitEnvironment = 'test' | 'production';

export type SumitProductConfig = {
  hostedUrl: string;
  productId: string;
};

export type SumitConfig = {
  apiBase: typeof SUMIT_API_BASE;
  environment: SumitEnvironment | null;
  companyId: string | null;
  apiKey: string | null;
  webOrigin: string | null;
  products: Partial<Record<LogicalSubscriptionProductId, SumitProductConfig>>;
  liveApiEnabled: boolean;
  liveCheckoutEnabled: boolean;
  missingApi: string[];
  missingCheckout: string[];
};

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function normalizeWebOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SUMIT_WEB_ORIGIN_INVALID');
  }
  const localhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (
    (parsed.protocol !== 'https:' &&
      !(localhost && parsed.protocol === 'http:')) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new Error('SUMIT_WEB_ORIGIN_INVALID');
  }
  return parsed.origin;
}

export function assertOfficialSumitHostedUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SUMIT_HOSTED_URL_INVALID');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    (host !== 'sumit.co.il' && !host.endsWith('.sumit.co.il')) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error('SUMIT_HOSTED_URL_INVALID');
  }
  return parsed.toString();
}

function parseProducts(
  raw: string | null
): Partial<Record<LogicalSubscriptionProductId, SumitProductConfig>> {
  if (!raw) {
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('SUMIT_PRODUCTS_CONFIG_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SUMIT_PRODUCTS_CONFIG_INVALID');
  }
  const source = value as Record<string, unknown>;
  const products: Partial<
    Record<LogicalSubscriptionProductId, SumitProductConfig>
  > = {};
  for (const logicalProductId of LOGICAL_SUBSCRIPTION_PRODUCTS) {
    const entry = source[logicalProductId];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const productId =
      typeof record.productId === 'string' ? record.productId.trim() : '';
    const hostedUrl =
      typeof record.hostedUrl === 'string' ? record.hostedUrl.trim() : '';
    if (!productId || productId.length > 160 || !hostedUrl) {
      throw new Error('SUMIT_PRODUCTS_CONFIG_INVALID');
    }
    products[logicalProductId] = {
      productId,
      hostedUrl: assertOfficialSumitHostedUrl(hostedUrl),
    };
  }
  return products;
}

export function assertServerOnlySumitEnvNames(): void {
  for (const name of SUMIT_SERVER_ENV_NAMES) {
    if (name.startsWith('EXPO_PUBLIC_')) {
      throw new Error('SUMIT_PUBLIC_ENV_FORBIDDEN');
    }
  }
}

export function resolveSumitConfig(
  env: Record<string, string | undefined> = {}
): SumitConfig {
  assertServerOnlySumitEnvNames();
  const rawEnvironment = trimmed(env.SUMIT_ENV);
  if (
    rawEnvironment !== null &&
    rawEnvironment !== 'test' &&
    rawEnvironment !== 'production'
  ) {
    throw new Error('SUMIT_ENV_INVALID');
  }
  const environment = rawEnvironment as SumitEnvironment | null;
  const companyId = trimmed(env.SUMIT_COMPANY_ID);
  if (companyId && (!/^\d+$/.test(companyId) || companyId === '0')) {
    throw new Error('SUMIT_COMPANY_ID_INVALID');
  }
  const apiKey = trimmed(env.SUMIT_API_KEY);
  const rawWebOrigin = trimmed(env.SUMIT_WEB_ORIGIN);
  const webOrigin = rawWebOrigin ? normalizeWebOrigin(rawWebOrigin) : null;
  const products = parseProducts(trimmed(env.SUMIT_PRODUCTS_JSON));

  const missingApi = [
    ...(environment ? [] : ['SUMIT_ENV']),
    ...(companyId ? [] : ['SUMIT_COMPANY_ID']),
    ...(apiKey ? [] : ['SUMIT_API_KEY']),
  ];
  const missingProducts = LOGICAL_SUBSCRIPTION_PRODUCTS.filter(
    (productId) => !products[productId]
  ).map((productId) => `SUMIT_PRODUCTS_JSON:${productId}`);
  const missingCheckout = [
    ...missingApi,
    ...(webOrigin ? [] : ['SUMIT_WEB_ORIGIN']),
    ...missingProducts,
  ];

  return {
    apiBase: SUMIT_API_BASE,
    environment,
    companyId,
    apiKey,
    webOrigin,
    products,
    liveApiEnabled: environment === 'test' && missingApi.length === 0,
    liveCheckoutEnabled: environment === 'test' && missingCheckout.length === 0,
    missingApi,
    missingCheckout,
  };
}

export function sumitConfigErrorCode(
  config: SumitConfig
): 'SUMIT_PRODUCTION_NOT_ENABLED' | 'SUMIT_CONFIG_MISSING' {
  return config.environment === 'production'
    ? 'SUMIT_PRODUCTION_NOT_ENABLED'
    : 'SUMIT_CONFIG_MISSING';
}

export function assertSumitApiConfigured(
  config: SumitConfig
): asserts config is SumitConfig & { companyId: string; apiKey: string } {
  if (!config.liveApiEnabled || !config.companyId || !config.apiKey) {
    throw new Error(sumitConfigErrorCode(config));
  }
}

export function publicSumitConfigStatus(config: SumitConfig) {
  return {
    environment: config.environment,
    liveApiEnabled: config.liveApiEnabled,
    liveCheckoutEnabled: config.liveCheckoutEnabled,
    missingApi: [...config.missingApi],
    missingCheckout: [...config.missingCheckout],
  };
}

export function buildSumitReturnUrls(webOrigin: string) {
  const origin = normalizeWebOrigin(webOrigin);
  return {
    success: `${origin}/billing/sumit/success`,
    cancel: `${origin}/billing/sumit/cancel`,
  };
}
