function normalizePublicUrl(value: string | undefined, fallbackUrl: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallbackUrl;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return fallbackUrl;
  }
  return normalized;
}

const DEFAULT_PRIVACY_POLICY_URL = 'https://stampix.app/legal/privacy';
const DEFAULT_TERMS_OF_SERVICE_URL = 'https://stampix.app/legal/terms';

export const PRIVACY_POLICY_URL = normalizePublicUrl(
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  DEFAULT_PRIVACY_POLICY_URL
);

export const TERMS_OF_SERVICE_URL = normalizePublicUrl(
  process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL,
  DEFAULT_TERMS_OF_SERVICE_URL
);
