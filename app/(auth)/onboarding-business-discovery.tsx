import { type Href, Redirect, useLocalSearchParams } from 'expo-router';

import {
  BUSINESS_ONBOARDING_ROUTES,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';

export default function LegacyBusinessDiscoveryRedirect() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();

  return (
    <Redirect
      href={
        withBusinessOnboardingFlow(
          BUSINESS_ONBOARDING_ROUTES.entry,
          flow
        ) as Href
      }
    />
  );
}
