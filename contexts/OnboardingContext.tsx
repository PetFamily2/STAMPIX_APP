import type React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';

export type BusinessDraft = {
  name: string;
  externalId: string;
  logoUrl?: string;
  colors?: string;
};

export type ProgramDraft = {
  title: string;
  rewardName: string;
  maxStamps: string;
  cardTerms: string;
  rewardConditions: string;
  stampIcon: string;
  stampShape: 'circle' | 'roundedSquare' | 'square' | 'hexagon' | 'icon';
  cardThemeId: string;
  imageStorageId: Id<'_storage'> | null;
  imagePreviewUri: string | null;
};

export type BusinessOnboardingDraft = {
  firstName: string;
  lastName: string;
  ageRange: string | null;
  discoverySource: string | null;
  reason: string | null;
  businessName: string;
  usageAreas: string[];
  formattedAddress: string;
  placeId: string;
  locationLat: number | null;
  locationLng: number | null;
  city: string;
  street: string;
  streetNumber: string;
};

export type OnboardingHydrationSnapshot = {
  businessDraft?: Partial<BusinessDraft> | null;
  programDraft?: Partial<ProgramDraft> | null;
  businessOnboardingDraft?: Partial<BusinessOnboardingDraft> | null;
  businessId?: Id<'businesses'> | null;
  programId?: Id<'loyaltyPrograms'> | null;
};

type OnboardingContextValue = {
  businessDraft: BusinessDraft;
  setBusinessDraft: React.Dispatch<React.SetStateAction<BusinessDraft>>;
  programDraft: ProgramDraft;
  setProgramDraft: React.Dispatch<React.SetStateAction<ProgramDraft>>;
  businessOnboardingDraft: BusinessOnboardingDraft;
  setBusinessOnboardingDraft: React.Dispatch<
    React.SetStateAction<BusinessOnboardingDraft>
  >;
  businessId: Id<'businesses'> | null;
  setBusinessId: (value: Id<'businesses'> | null) => void;
  programId: Id<'loyaltyPrograms'> | null;
  setProgramId: (value: Id<'loyaltyPrograms'> | null) => void;
  hydrate: (snapshot: OnboardingHydrationSnapshot) => void;
  reset: () => void;
};

const defaultBusinessDraft: BusinessDraft = {
  name: '',
  externalId: '',
};

const defaultProgramDraft: ProgramDraft = {
  title: '',
  rewardName: '',
  maxStamps: '10',
  cardTerms: '',
  rewardConditions: '',
  stampIcon: 'star',
  stampShape: 'circle',
  cardThemeId: 'midnight-luxe',
  imageStorageId: null,
  imagePreviewUri: null,
};

const defaultBusinessOnboardingDraft: BusinessOnboardingDraft = {
  firstName: '',
  lastName: '',
  ageRange: null,
  discoverySource: null,
  reason: null,
  businessName: '',
  usageAreas: [],
  formattedAddress: '',
  placeId: '',
  locationLat: null,
  locationLng: null,
  city: '',
  street: '',
  streetNumber: '',
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
  const [businessOnboardingDraft, setBusinessOnboardingDraft] =
    useState<BusinessOnboardingDraft>(() => ({
      ...defaultBusinessOnboardingDraft,
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
      businessOnboardingDraft,
      setBusinessOnboardingDraft,
      businessId,
      setBusinessId,
      programId,
      setProgramId,
      hydrate: (snapshot: OnboardingHydrationSnapshot) => {
        setBusinessDraft({
          ...defaultBusinessDraft,
          ...(snapshot.businessDraft ?? {}),
        });
        setProgramDraft({
          ...defaultProgramDraft,
          ...(snapshot.programDraft ?? {}),
        });
        setBusinessOnboardingDraft({
          ...defaultBusinessOnboardingDraft,
          ...(snapshot.businessOnboardingDraft ?? {}),
        });
        setBusinessId(snapshot.businessId ?? null);
        setProgramId(snapshot.programId ?? null);
      },
      reset: () => {
        setBusinessDraft({ ...defaultBusinessDraft });
        setProgramDraft({ ...defaultProgramDraft });
        setBusinessOnboardingDraft({ ...defaultBusinessOnboardingDraft });
        setBusinessId(null);
        setProgramId(null);
      },
    }),
    [
      businessDraft,
      programDraft,
      businessOnboardingDraft,
      businessId,
      programId,
    ]
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
