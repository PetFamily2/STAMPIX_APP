import { Redirect, Slot } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useRoleGuard, BUSINESS_ROLES } from '@/lib/hooks/useRoleGuard';

export default function MerchantLayout() {
  const { user, isLoading, isAuthorized } = useRoleGuard(BUSINESS_ROLES);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user || !isAuthorized) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return <Slot />;
}




