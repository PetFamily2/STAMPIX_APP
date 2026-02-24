import { Redirect, Slot, useLocalSearchParams, useSegments } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { BUSINESS_ROLES, useRoleGuard } from '@/lib/hooks/useRoleGuard';

export default function MerchantLayout() {
  const { user, isLoading, isAuthorized } = useRoleGuard(BUSINESS_ROLES);
  const segments = useSegments();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const segmentStrings = segments as string[];
  const isOnboardingRoute = segmentStrings.includes('onboarding');

  if (isLoading && !isOnboardingRoute) {
    return <FullScreenLoading />;
  }

  if (!isPreviewMode && user?.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
  }

  if (!user || !isAuthorized) {
    if (isPreviewMode) {
      return <Slot />;
    }
    if (user && isOnboardingRoute) {
      return <Slot />;
    }
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return <Slot />;
}
