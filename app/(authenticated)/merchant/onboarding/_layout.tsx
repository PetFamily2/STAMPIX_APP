import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { useUser } from '@/contexts/UserContext';

export default function MerchantOnboardingLayout() {
  const { user, isLoading } = useUser();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreviewMode = IS_DEV_MODE && preview === 'true';

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <OnboardingProvider>
      <Slot />
    </OnboardingProvider>
  );
}
