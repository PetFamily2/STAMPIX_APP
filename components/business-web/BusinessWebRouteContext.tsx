import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createNavigationGuardRegistry,
  type NavigationGuard,
} from '@/lib/network/navigationGuards';
import { registerUnsavedEdits } from '@/lib/network/unsavedEdits';

type BusinessWebRouteContextValue = {
  setNavigationGuard: (key: symbol, guard: NavigationGuard | null) => void;
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
    () => ({
      setNavigationGuard: createNavigationGuardRegistry(onGuardChange),
    }),
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
  const guardKey = useRef(Symbol('form'));

  useEffect(() => {
    if (!context) {
      return;
    }
    const key = guardKey.current;
    context.setNavigationGuard(key, { isDirty, onDiscard });
    return () => context.setNavigationGuard(key, null);
  }, [context, isDirty, onDiscard]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const release = registerUnsavedEdits();
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}

export function useBusinessWebNavigationGuardState() {
  const [guard, setGuard] = useState<NavigationGuard | null>(null);
  const handleGuardChange = useCallback((next: NavigationGuard | null) => {
    setGuard(next);
  }, []);
  return { guard, handleGuardChange };
}
