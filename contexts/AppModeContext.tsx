import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSessionContext } from '@/contexts/UserContext';

export type AppMode = 'customer' | 'business';

type AppModeContextValue = {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => Promise<void>;
  syncAppMode: (mode: AppMode) => Promise<void>;
  resetAppMode: () => Promise<void>;
  isLoading: boolean;
};

const STORAGE_KEY = 'stampaix.appMode';
// Legacy typo key kept for migration only.
const LEGACY_STORAGE_KEY = 'stamprix.appMode';
const AppModeContext = createContext<AppModeContextValue | undefined>(
  undefined
);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const sessionContext = useSessionContext();
  const [appMode, setAppModeState] = useState<AppMode>('customer');
  const [isLoading, setIsLoading] = useState(true);
  const [isAccountStateReset, setIsAccountStateReset] = useState(false);
  const pendingModeRef = useRef<AppMode | null>(null);
  const resetForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const storedPrimary = await SecureStore.getItemAsync(STORAGE_KEY);
        const storedLegacy = storedPrimary
          ? null
          : await SecureStore.getItemAsync(LEGACY_STORAGE_KEY);
        const stored = storedPrimary ?? storedLegacy;
        if (stored === 'customer' || stored === 'business') {
          if (isMounted) {
            setAppModeState(stored);
          }
          if (storedLegacy) {
            await SecureStore.setItemAsync(STORAGE_KEY, stored);
            await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
          }
        }
        if (stored === 'merchant' || stored === 'staff') {
          if (isMounted) {
            setAppModeState('business');
          }
          await SecureStore.setItemAsync(STORAGE_KEY, 'business');
          await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const persistMode = useCallback(async (mode: AppMode) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, mode);
      await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore persistence errors; app still uses in-memory mode.
    }
  }, []);

  const setAppMode = useCallback(
    async (mode: AppMode) => {
      pendingModeRef.current = mode;
      setAppModeState(mode);
      await persistMode(mode);
    },
    [persistMode]
  );

  const syncAppMode = useCallback(
    async (mode: AppMode) => {
      if (isAccountStateReset) {
        return;
      }

      const pendingMode = pendingModeRef.current;
      if (pendingMode && pendingMode !== mode) {
        return;
      }

      pendingModeRef.current = null;
      setAppModeState(mode);
      await persistMode(mode);
    },
    [isAccountStateReset, persistMode]
  );

  const resetAppMode = useCallback(async () => {
    resetForUserIdRef.current = sessionContext?.user._id
      ? String(sessionContext.user._id)
      : null;
    pendingModeRef.current = null;
    setAppModeState('customer');
    setIsAccountStateReset(true);

    const storageCleanup = await Promise.allSettled([
      SecureStore.deleteItemAsync(STORAGE_KEY),
      SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY),
    ]);
    if (storageCleanup.some((result) => result.status === 'rejected')) {
      throw new Error('APP_MODE_STORAGE_RESET_FAILED');
    }
  }, [sessionContext?.user._id]);

  useEffect(() => {
    const currentUserId = sessionContext?.user._id
      ? String(sessionContext.user._id)
      : null;
    if (
      !isAccountStateReset ||
      !currentUserId ||
      currentUserId === resetForUserIdRef.current
    ) {
      return;
    }

    resetForUserIdRef.current = null;
    setIsAccountStateReset(false);
  }, [isAccountStateReset, sessionContext?.user._id]);

  const value = useMemo(
    () => ({
      appMode,
      setAppMode,
      syncAppMode,
      resetAppMode,
      isLoading,
    }),
    [appMode, isLoading, resetAppMode, setAppMode, syncAppMode]
  );

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within AppModeProvider');
  }
  return context;
}
