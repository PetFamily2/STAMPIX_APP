export type ActiveBusinessShell = 'none' | 'business' | 'staff';

export type ActiveBusinessStaffRole = 'owner' | 'manager' | 'staff';

export type ActiveBusinessMembership = {
  id: string;
  staffRole: ActiveBusinessStaffRole;
};

export function getActiveMembershipByBusinessId(
  businesses: ActiveBusinessMembership[],
  activeBusinessId: string | null | undefined
): ActiveBusinessMembership | null {
  if (!activeBusinessId) {
    return null;
  }

  return (
    businesses.find(
      (business) => String(business.id) === String(activeBusinessId)
    ) ?? null
  );
}

export function resolveActiveBusinessShell(
  businesses: ActiveBusinessMembership[],
  activeBusinessId: string | null | undefined
): ActiveBusinessShell {
  const activeMembership = getActiveMembershipByBusinessId(
    businesses,
    activeBusinessId
  );
  if (!activeMembership) {
    return 'none';
  }

  if (
    activeMembership.staffRole === 'owner' ||
    activeMembership.staffRole === 'manager'
  ) {
    return 'business';
  }

  return 'staff';
}

export function requiresBusinessOnboardingForRole(
  staffRole: ActiveBusinessStaffRole | null | undefined,
  businessOnboarded: boolean
) {
  return staffRole === 'owner' && !businessOnboarded;
}
