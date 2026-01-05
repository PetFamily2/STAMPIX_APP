import { Redirect, Slot } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useUser } from '@/contexts/UserContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';

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


