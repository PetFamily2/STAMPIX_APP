import { Redirect } from 'expo-router';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

export default function MerchantOnboardingIndex() {
  return <Redirect href={BUSINESS_ONBOARDING_ROUTES.role} />;
}
