import { getConvexUrl } from '@/utils/convexConfig';

export const CONVEX_AUTH_STORAGE_NAMESPACE = 'stampix_auth';

const CONVEX_AUTH_STORAGE_BASE_KEYS = [
  '__convexAuthJWT',
  '__convexAuthRefreshToken',
  '__convexAuthOAuthVerifier',
  '__convexAuthServerStateFetchTime',
] as const;

const CONVEX_URL_ENV_KEYS = [
  'EXPO_PUBLIC_CONVEX_URL_DEV',
  'EXPO_PUBLIC_CONVEX_URL_PROD',
  'EXPO_PUBLIC_CONVEX_URL',
] as const;

function escapeNamespace(namespace: string) {
  return namespace.replace(/[^a-zA-Z0-9]/g, '');
}

export function buildConvexAuthSecureStoreKeys(namespace: string): string[] {
  const escapedNamespace = escapeNamespace(namespace);
  return CONVEX_AUTH_STORAGE_BASE_KEYS.map(
    (baseKey) => `${baseKey}_${escapedNamespace}`
  );
}

function readCurrentConvexNamespace(): string | null {
  try {
    return getConvexUrl();
  } catch {
    return null;
  }
}

function readEnvNamespace(
  key: (typeof CONVEX_URL_ENV_KEYS)[number]
): string | null {
  const value = process.env[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

export function getConvexAuthSecureStoreKeysForCleanup(): string[] {
  const namespaces = new Set<string>([CONVEX_AUTH_STORAGE_NAMESPACE]);

  const currentNamespace = readCurrentConvexNamespace();
  if (currentNamespace) {
    namespaces.add(currentNamespace);
  }

  for (const key of CONVEX_URL_ENV_KEYS) {
    const envNamespace = readEnvNamespace(key);
    if (envNamespace) {
      namespaces.add(envNamespace);
    }
  }

  const secureStoreKeys = new Set<string>();
  for (const namespace of namespaces) {
    for (const key of buildConvexAuthSecureStoreKeys(namespace)) {
      secureStoreKeys.add(key);
    }
  }

  return Array.from(secureStoreKeys);
}
