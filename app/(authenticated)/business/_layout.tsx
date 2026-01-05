import { Redirect, Slot } from 'expo-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useUser } from '@/contexts/UserContext';
import type { AppRole } from '@/lib/domain/roles';
import { BUSINESS_ROLES, CUSTOMER_ROLE } from '@/lib/hooks/useRoleGuard';

export default function BusinessAreaLayout() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const role = (user.role ?? CUSTOMER_ROLE) as AppRole;
  if (!BUSINESS_ROLES.includes(role)) {
    return <Redirect href="/(authenticated)/wallet" />;
  }

  return <Slot />;
}

