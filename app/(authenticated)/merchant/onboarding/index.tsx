import { useQuery } from 'convex/react';
import { type Href, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import {
  type BusinessDraft,
  type BusinessOnboardingDraft,
  type ProgramDraft,
  useOnboarding,
} from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import {
  getBusinessOnboardingRouteForStep,
  resolveBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toBusinessDraft(value: unknown): Partial<BusinessDraft> | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  return {
    name: typeof source.name === 'string' ? source.name : undefined,
    externalId:
      typeof source.externalId === 'string' ? source.externalId : undefined,
    logoUrl: typeof source.logoUrl === 'string' ? source.logoUrl : undefined,
    colors: typeof source.colors === 'string' ? source.colors : undefined,
  };
}

function toProgramDraft(value: unknown): Partial<ProgramDraft> | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  return {
    title: typeof source.title === 'string' ? source.title : undefined,
    rewardName:
      typeof source.rewardName === 'string' ? source.rewardName : undefined,
    maxStamps:
      typeof source.maxStamps === 'string' ? source.maxStamps : undefined,
    cardTerms:
      typeof source.cardTerms === 'string' ? source.cardTerms : undefined,
    rewardConditions:
      typeof source.rewardConditions === 'string'
        ? source.rewardConditions
        : undefined,
    stampIcon:
      typeof source.stampIcon === 'string' ? source.stampIcon : undefined,
    stampShape:
      source.stampShape === 'circle' ||
      source.stampShape === 'roundedSquare' ||
      source.stampShape === 'square' ||
      source.stampShape === 'hexagon' ||
      source.stampShape === 'icon'
        ? source.stampShape
        : undefined,
    cardThemeId:
      typeof source.cardThemeId === 'string' ? source.cardThemeId : undefined,
    imageStorageId: source.imageStorageId as ProgramDraft['imageStorageId'],
    imagePreviewUri:
      typeof source.imagePreviewUri === 'string'
        ? source.imagePreviewUri
        : null,
  };
}

function toBusinessOnboardingDraft(
  value: unknown
): Partial<BusinessOnboardingDraft> | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  return {
    firstName:
      typeof source.firstName === 'string' ? source.firstName : undefined,
    lastName: typeof source.lastName === 'string' ? source.lastName : undefined,
    ageRange: typeof source.ageRange === 'string' ? source.ageRange : null,
    discoverySource:
      typeof source.discoverySource === 'string'
        ? source.discoverySource
        : null,
    reason: typeof source.reason === 'string' ? source.reason : null,
    businessName:
      typeof source.businessName === 'string' ? source.businessName : undefined,
    usageAreas: Array.isArray(source.usageAreas)
      ? source.usageAreas.filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : undefined,
    businessExample:
      typeof source.businessExample === 'string'
        ? source.businessExample
        : null,
    cadenceBand:
      typeof source.cadenceBand === 'string' ? source.cadenceBand : null,
    birthdayCampaignRelevant:
      source.birthdayCampaignRelevant === true ||
      source.birthdayCampaignRelevant === false
        ? source.birthdayCampaignRelevant
        : null,
    joinAnniversaryCampaignRelevant:
      source.joinAnniversaryCampaignRelevant === true ||
      source.joinAnniversaryCampaignRelevant === false
        ? source.joinAnniversaryCampaignRelevant
        : null,
    weakTimePromosRelevant:
      source.weakTimePromosRelevant === true ||
      source.weakTimePromosRelevant === false
        ? source.weakTimePromosRelevant
        : null,
    formattedAddress:
      typeof source.formattedAddress === 'string'
        ? source.formattedAddress
        : undefined,
    placeId: typeof source.placeId === 'string' ? source.placeId : undefined,
    locationLat:
      typeof source.locationLat === 'number' ? source.locationLat : null,
    locationLng:
      typeof source.locationLng === 'number' ? source.locationLng : null,
    city: typeof source.city === 'string' ? source.city : undefined,
    street: typeof source.street === 'string' ? source.street : undefined,
    streetNumber:
      typeof source.streetNumber === 'string' ? source.streetNumber : undefined,
  };
}

export default function MerchantOnboardingIndex() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const onboarding = useOnboarding();
  const user = useQuery(api.users.getCurrentUser);
  const resolvedFlow = resolveBusinessOnboardingFlow(flow);
  const draft = useQuery(api.onboarding.getMyBusinessOnboardingDraft, {
    flow: resolvedFlow,
  });
  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedFlowRef = useRef<string | null>(null);

  useEffect(() => {
    if (user === undefined || draft === undefined) {
      return;
    }

    if (hydratedFlowRef.current === resolvedFlow) {
      return;
    }

    if (draft) {
      onboarding.hydrate({
        businessDraft: toBusinessDraft(draft.businessDraft),
        programDraft: toProgramDraft(draft.programDraft),
        businessOnboardingDraft: toBusinessOnboardingDraft(
          draft.businessOnboardingDraft
        ),
        businessId: draft.businessId,
        programId: draft.programId,
      });
    } else {
      onboarding.reset();
    }

    hydratedFlowRef.current = resolvedFlow;
    setIsHydrated(true);
  }, [draft, onboarding, resolvedFlow, user]);

  if (user === undefined || draft === undefined || !isHydrated) {
    return <FullScreenLoading />;
  }

  const resumeStep =
    draft?.status === 'paused' ? draft.farthestStep : draft?.currentStep;
  const draftFlow = draft?.flow ?? resolvedFlow;
  const targetRoute = resumeStep
    ? getBusinessOnboardingRouteForStep(resumeStep, draftFlow)
    : getBusinessOnboardingRouteForStep(
        resolvedFlow === 'additional' ? 'name' : 'role',
        resolvedFlow
      );

  return <Redirect href={targetRoute as Href} />;
}
