import type React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';

type BusinessDraft = {
  name: string;
  externalId: string;
  logoUrl?: string;
  colors?: string;
};

type ProgramDraft = {
  title: string;
  rewardName: string;
  maxStamps: string;
  stampIcon: string;
};

type OnboardingContextValue = {
  businessDraft: BusinessDraft;
  setBusinessDraft: React.Dispatch<React.SetStateAction<BusinessDraft>>;
  programDraft: ProgramDraft;
  setProgramDraft: React.Dispatch<React.SetStateAction<ProgramDraft>>;
  businessId: Id<'businesses'> | null;
  setBusinessId: (value: Id<'businesses'> | null) => void;
  programId: Id<'loyaltyPrograms'> | null;
  setProgramId: (value: Id<'loyaltyPrograms'> | null) => void;
  reset: () => void;
};

const defaultBusinessDraft: BusinessDraft = {
  name: '',
  externalId: '',
};

const defaultProgramDraft: ProgramDraft = {
  title: 'כרטיס נאמנות',
  rewardName: 'הטבה ראשונה',
  maxStamps: '10',
  stampIcon: 'star',
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(
  undefined
);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [businessDraft, setBusinessDraft] = useState<BusinessDraft>(() => ({
    ...defaultBusinessDraft,
  }));
  const [programDraft, setProgramDraft] = useState<ProgramDraft>(() => ({
    ...defaultProgramDraft,
  }));
  const [businessId, setBusinessId] = useState<Id<'businesses'> | null>(null);
  const [programId, setProgramId] = useState<Id<'loyaltyPrograms'> | null>(
    null
  );

  const value = useMemo(
    () => ({
      businessDraft,
      setBusinessDraft,
      programDraft,
      setProgramDraft,
      businessId,
      setBusinessId,
      programId,
      setProgramId,
      reset: () => {
        setBusinessDraft({ ...defaultBusinessDraft });
        setProgramDraft({ ...defaultProgramDraft });
        setBusinessId(null);
        setProgramId(null);
      },
    }),
    [businessDraft, programDraft, businessId, programId]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
