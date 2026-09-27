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
    if (isAccountStateReset) {
      setIsLoading(false);
      return;
    }

    const sessionMode = sessionContext?.activeMode;
    if (
      (sessionMode === 'customer' || sessionMode === 'business') &&
      pendingModeRef.current == null
    ) {
      setAppModeState(sessionMode);
    }

    if (sessionContext !== undefined) {
      setIsLoading(false);
    }
  }, [isAccountStateReset, sessionContext]);

  const setAppMode = useCallback(async (mode: AppMode) => {
    pendingModeRef.current = mode;
    setAppModeState(mode);
  }, []);

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
    },
    [isAccountStateReset]
  );

  const resetAppMode = useCallback(async () => {
    resetForUserIdRef.current = sessionContext?.user._id
      ? String(sessionContext.user._id)
      : null;
    pendingModeRef.current = null;
    setAppModeState('customer');
    setIsAccountStateReset(true);
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
