import * as SecureStore from 'expo-secure-store';

import { CONVEX_AUTH_STORAGE_NAMESPACE } from '@/lib/auth/storageKeys';

// Store auth tokens in expo-secure-store.
// This keeps user session data out of plain AsyncStorage.
const secureStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore secure storage write failures; auth will retry through provider state.
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore secure storage delete failures; auth state handles cleanup fallback.
    }
  },
};

export function getConvexAuthProviderStorageProps() {
  return {
    storage: secureStorage,
    storageNamespace: CONVEX_AUTH_STORAGE_NAMESPACE,
  };
}
