import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  type BusinessOnboardingStep,
  getBusinessOnboardingStepOrder,
  resolveBusinessOnboardingDraftIdentifiers,
  resolveBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';

type SaveBusinessOnboardingStepInput = {
  step: BusinessOnboardingStep;
  flow?: string | string[] | null;
  status?: 'in_progress' | 'paused' | 'completed';
  businessId?: Id<'businesses'>;
  programId?: Id<'loyaltyPrograms'>;
};

export function useBusinessOnboardingDraftPersistence() {
  const saveMyBusinessOnboardingDraft = useMutation(
    api.onboarding.saveMyBusinessOnboardingDraft
  );
  const {
    businessDraft,
    programDraft,
    businessOnboardingDraft,
    businessId,
    programId,
  } = useOnboarding();

  const saveStep = useCallback(
    async ({
      step,
      flow,
      status,
      businessId: businessIdOverride,
      programId: programIdOverride,
    }: SaveBusinessOnboardingStepInput) => {
      const resolvedFlow = resolveBusinessOnboardingFlow(flow);
      const normalizedStepOrder = getBusinessOnboardingStepOrder(
        step,
        resolvedFlow
      );
      const resolvedIdentifiers = resolveBusinessOnboardingDraftIdentifiers({
        contextBusinessId: businessId,
        contextProgramId: programId,
        businessId: businessIdOverride,
        programId: programIdOverride,
      });

      await saveMyBusinessOnboardingDraft({
        flow: resolvedFlow,
        currentStep: step,
        status,
        businessId: resolvedIdentifiers.businessId,
        programId: resolvedIdentifiers.programId,
        businessDraft,
        programDraft,
        businessOnboardingDraft,
      });

      return normalizedStepOrder;
    },
    [
      businessDraft,
      businessId,
      businessOnboardingDraft,
      programDraft,
      programId,
      saveMyBusinessOnboardingDraft,
    ]
  );

  return { saveStep };
}
