import { useSessionContext, useUser } from '@/contexts/UserContext';
import type { AppRole } from '@/lib/domain/roles';

export const BUSINESS_ROLES: AppRole[] = ['merchant', 'staff', 'admin'];
export const CUSTOMER_ROLE: AppRole = 'customer';

function deriveRoleFromSession(
  sessionContext: ReturnType<typeof useSessionContext>
): AppRole {
  if (!sessionContext) return 'customer';
  if (sessionContext.isAdmin) return 'admin';
  if (sessionContext.roles.owner || sessionContext.roles.manager)
    return 'merchant';
  if (sessionContext.roles.staff) return 'staff';
  return 'customer';
}

export function useRoleGuard(allowedRoles: AppRole[]) {
  const { user, isLoading } = useUser();
  const sessionContext = useSessionContext();
  const role = deriveRoleFromSession(sessionContext);

  const isAuthorized = Boolean(user) && allowedRoles.includes(role);

  return {
    user,
    role,
    isLoading,
    isAuthorized,
  };
}
