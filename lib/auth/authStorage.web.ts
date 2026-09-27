import { CONVEX_AUTH_STORAGE_NAMESPACE } from '@/lib/auth/storageKeys';

export function getConvexAuthProviderStorageProps() {
  return {
    storageNamespace: CONVEX_AUTH_STORAGE_NAMESPACE,
  };
}
