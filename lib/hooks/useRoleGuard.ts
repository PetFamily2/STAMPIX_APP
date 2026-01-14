import { useUser } from '@/contexts/UserContext';
import type { AppRole } from '@/lib/domain/roles';

export const BUSINESS_ROLES: AppRole[] = ['merchant', 'staff', 'admin'];
export const CUSTOMER_ROLE: AppRole = 'customer';

export function useRoleGuard(allowedRoles: AppRole[]) {
  const { user, isLoading } = useUser();
  const role = (user?.role ?? CUSTOMER_ROLE) as AppRole;
  const isAuthorized = Boolean(user) && allowedRoles.includes(role);

  return {
    user,
    role,
    isLoading,
    isAuthorized,
  };
}




