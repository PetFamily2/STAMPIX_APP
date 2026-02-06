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
  hasSelectedMode: boolean;
};

const STORAGE_KEY = 'stamprix.appMode';
const AppModeContext = createContext<AppModeContextValue | undefined>(
  undefined
);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>('customer');
  const [isLoading, setIsLoading] = useState(true);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored === 'customer' || stored === 'business') {
          if (isMounted) {
            setAppModeState(stored);
            setHasSelectedMode(true);
          }
        }
        if (stored === 'merchant') {
          if (isMounted) {
            setAppModeState('business');
            setHasSelectedMode(true);
          }
          await SecureStore.setItemAsync(STORAGE_KEY, 'business');
        }
        if (!stored && isMounted) {
          setHasSelectedMode(false);
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
    setHasSelectedMode(true);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, mode);
    } catch {
      // Ignore persistence errors; app still uses in-memory mode.
    }
  }, []);

  const value = useMemo(
    () => ({
      appMode,
      setAppMode,
      isLoading,
      hasSelectedMode,
    }),
    [appMode, setAppMode, isLoading, hasSelectedMode]
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
