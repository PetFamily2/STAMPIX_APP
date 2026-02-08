import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { BUSINESS_ROLES, useRoleGuard } from '@/lib/hooks/useRoleGuard';

export default function MerchantLayout() {
  const { user, isLoading, isAuthorized } = useRoleGuard(BUSINESS_ROLES);
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode =
    (IS_DEV_MODE && preview === 'true') || map === 'true';

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user || !isAuthorized) {
    if (isPreviewMode) {
      return <Slot />;
    }
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return <Slot />;
}
