import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useUser } from '@/contexts/UserContext';

export default function MerchantOnboardingLayout() {
  const { user, isLoading } = useUser();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';

  if (!isLoading && !user && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (!isPreviewMode && user?.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
  }

  return <Slot />;
}
