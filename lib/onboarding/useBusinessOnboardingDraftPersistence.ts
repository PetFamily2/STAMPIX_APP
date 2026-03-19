import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import {
  type BusinessOnboardingStep,
  getBusinessOnboardingStepOrder,
  resolveBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';

type SaveBusinessOnboardingStepInput = {
  step: BusinessOnboardingStep;
  flow?: string | string[] | null;
  status?: 'in_progress' | 'paused' | 'completed';
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
    async ({ step, flow, status }: SaveBusinessOnboardingStepInput) => {
      const resolvedFlow = resolveBusinessOnboardingFlow(flow);
      const normalizedStepOrder = getBusinessOnboardingStepOrder(
        step,
        resolvedFlow
      );

      await saveMyBusinessOnboardingDraft({
        flow: resolvedFlow,
        currentStep: step,
        status,
        businessId: businessId ?? undefined,
        programId: programId ?? undefined,
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
