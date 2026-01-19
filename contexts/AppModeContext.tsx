import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

export type AppMode = "customer" | "merchant";

type AppModeContextValue = {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => Promise<void>;
  isLoading: boolean;
};

const STORAGE_KEY = "stamprix.appMode";
const AppModeContext = createContext<AppModeContextValue | undefined>(undefined);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>("customer");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored === "customer" || stored === "merchant") {
          if (isMounted) {
            setAppModeState(stored);
          }
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

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used within AppModeProvider");
  }
  return context;
}
