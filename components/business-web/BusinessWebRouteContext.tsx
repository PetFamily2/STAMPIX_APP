import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type NavigationGuard = {
  isDirty: boolean;
  onDiscard?: () => void;
};

type BusinessWebRouteContextValue = {
  setNavigationGuard: (guard: NavigationGuard | null) => void;
};

const BusinessWebRouteContext = createContext<
  BusinessWebRouteContextValue | undefined
>(undefined);

export function BusinessWebRouteProvider({
  children,
  onGuardChange,
}: {
  children: ReactNode;
  onGuardChange: (guard: NavigationGuard | null) => void;
}) {
  const value = useMemo(
    () => ({ setNavigationGuard: onGuardChange }),
    [onGuardChange]
  );
  return (
    <BusinessWebRouteContext.Provider value={value}>
      {children}
    </BusinessWebRouteContext.Provider>
  );
}

export function useBusinessWebUnsavedChanges(
  isDirty: boolean,
  onDiscard?: () => void
) {
  const context = useContext(BusinessWebRouteContext);

  useEffect(() => {
    if (!context) {
      return;
    }
    context.setNavigationGuard({ isDirty, onDiscard });
    return () => context.setNavigationGuard(null);
  }, [context, isDirty, onDiscard]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}

export function useBusinessWebNavigationGuardState() {
  const [guard, setGuard] = useState<NavigationGuard | null>(null);
  const handleGuardChange = useCallback((next: NavigationGuard | null) => {
    setGuard(next);
  }, []);
  return { guard, handleGuardChange };
}
