import { generateOpaqueToken } from '../ids';

export const PROVIDER_APP_USER_ID_PREFIX = 'ba_';
export const LEGACY_BUSINESS_APP_USER_PREFIX = 'business:';

export function createProviderAppUserId(): string {
  return `${PROVIDER_APP_USER_ID_PREFIX}${generateOpaqueToken(24)}`;
}

export function isOpaqueProviderAppUserId(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  return (
    normalized.startsWith(PROVIDER_APP_USER_ID_PREFIX) &&
    normalized.length > PROVIDER_APP_USER_ID_PREFIX.length + 8 &&
    !normalized.includes('@') &&
    !normalized.includes(' ')
  );
}

export function isLegacyBusinessScopedAppUserId(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (!normalized.startsWith(LEGACY_BUSINESS_APP_USER_PREFIX)) {
    return false;
  }
  const businessId = normalized.slice(LEGACY_BUSINESS_APP_USER_PREFIX.length);
  return businessId.length > 0 && !businessId.includes(':');
}

export function parseLegacyBusinessIdFromAppUserId(
  value: string
): string | null {
  if (!isLegacyBusinessScopedAppUserId(value)) {
    return null;
  }
  return value.trim().slice(LEGACY_BUSINESS_APP_USER_PREFIX.length);
}

export function isUsableProviderAppUserId(value: unknown): boolean {
  return (
    isOpaqueProviderAppUserId(value) || isLegacyBusinessScopedAppUserId(value)
  );
}
