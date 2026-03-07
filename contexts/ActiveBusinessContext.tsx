import { useMutation, useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type BusinessForStaff = {
  businessId: Id<'businesses'>;
  name: string;
  externalId: string;
  businessPublicId: string | null;
  joinCode: string | null;
  logoUrl: string | null;
  colors: unknown | null;
  staffRole: 'owner' | 'manager' | 'staff';
};

type ActiveBusinessContextValue = {
  businesses: BusinessForStaff[];
  activeBusinessId: Id<'businesses'> | null;
  activeBusiness: BusinessForStaff | null;
  isLoading: boolean;
  isSwitchingBusiness: boolean;
  setActiveBusinessId: (businessId: Id<'businesses'>) => Promise<void>;
};

const ActiveBusinessContext = createContext<
  ActiveBusinessContextValue | undefined
>(undefined);

export function ActiveBusinessProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionContext = useSessionContext();
  const businessesQuery = useQuery(api.scanner.myBusinesses);
  const setActiveBusiness = useMutation(api.users.setActiveBusiness);
  const businesses = (businessesQuery ?? []) as BusinessForStaff[];

  const [localBusinessIdOverride, setLocalBusinessIdOverride] =
    useState<Id<'businesses'> | null>(null);
  const [isSwitchingBusiness, setIsSwitchingBusiness] = useState(false);

  useEffect(() => {
    if (!localBusinessIdOverride) {
      return;
    }
    if (
      businesses.some(
        (business) => business.businessId === localBusinessIdOverride
      )
    ) {
      return;
    }
    setLocalBusinessIdOverride(null);
  }, [businesses, localBusinessIdOverride]);

  useEffect(() => {
    if (!localBusinessIdOverride || !sessionContext?.activeBusinessId) {
      return;
    }
    if (localBusinessIdOverride === sessionContext.activeBusinessId) {
      setLocalBusinessIdOverride(null);
    }
  }, [localBusinessIdOverride, sessionContext?.activeBusinessId]);

  const activeBusinessId = useMemo(() => {
    if (
      localBusinessIdOverride &&
      businesses.some(
        (business) => business.businessId === localBusinessIdOverride
      )
    ) {
      return localBusinessIdOverride;
    }

    if (
      sessionContext?.activeBusinessId &&
      businesses.some(
        (business) => business.businessId === sessionContext.activeBusinessId
      )
    ) {
      return sessionContext.activeBusinessId;
    }

    return businesses[0]?.businessId ?? null;
  }, [businesses, localBusinessIdOverride, sessionContext?.activeBusinessId]);

  const activeBusiness = useMemo(
    () =>
      businesses.find((business) => business.businessId === activeBusinessId) ??
      null,
    [activeBusinessId, businesses]
  );

  const setActiveBusinessId = useCallback(
    async (businessId: Id<'businesses'>) => {
      if (!businesses.some((business) => business.businessId === businessId)) {
        throw new Error('BUSINESS_NOT_AVAILABLE');
      }

      if (activeBusinessId === businessId || isSwitchingBusiness) {
        return;
      }

      const previousOverride = localBusinessIdOverride;
      setLocalBusinessIdOverride(businessId);
      setIsSwitchingBusiness(true);

      try {
        await setActiveBusiness({ businessId });
      } catch (error) {
        setLocalBusinessIdOverride(previousOverride ?? null);
        throw error;
      } finally {
        setIsSwitchingBusiness(false);
      }
    },
    [
      activeBusinessId,
      businesses,
      isSwitchingBusiness,
      localBusinessIdOverride,
      setActiveBusiness,
    ]
  );

  const value = useMemo(
    () => ({
      businesses,
      activeBusinessId,
      activeBusiness,
      isLoading: sessionContext === undefined || businessesQuery === undefined,
      isSwitchingBusiness,
      setActiveBusinessId,
    }),
    [
      activeBusiness,
      activeBusinessId,
      businesses,
      businessesQuery,
      isSwitchingBusiness,
      sessionContext,
      setActiveBusinessId,
    ]
  );

  return (
    <ActiveBusinessContext.Provider value={value}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

export function useActiveBusinessContext() {
  const context = useContext(ActiveBusinessContext);
  if (!context) {
    throw new Error(
      'useActiveBusinessContext must be used within ActiveBusinessProvider'
    );
  }
  return context;
}
