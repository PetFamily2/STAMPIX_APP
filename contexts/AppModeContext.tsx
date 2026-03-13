import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type AppMode = 'customer' | 'business';

type AppModeContextValue = {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => Promise<void>;
  isLoading: boolean;
};

const STORAGE_KEY = 'stampaix.appMode';
// Legacy typo key kept for migration only.
const LEGACY_STORAGE_KEY = 'stamprix.appMode';
const AppModeContext = createContext<AppModeContextValue | undefined>(
  undefined
);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>('customer');
  const [isLoading, setIsLoading] = useState(true);

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

  const setAppMode = useCallback(async (mode: AppMode) => {
    setAppModeState(mode);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, mode);
      await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore persistence errors; app still uses in-memory mode.
    }
  }, []);

  const value = useMemo(
    () => ({
      appMode,
      setAppMode,
      isLoading,
    }),
    [appMode, setAppMode, isLoading]
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
