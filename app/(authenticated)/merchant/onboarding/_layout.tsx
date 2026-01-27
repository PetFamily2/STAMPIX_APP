import { Redirect, Slot } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { useUser } from '@/contexts/UserContext';

export default function MerchantOnboardingLayout() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <OnboardingProvider>
      <Slot />
    </OnboardingProvider>
  );
}
