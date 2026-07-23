type DashboardBusinessIdentityInput = {
  responseBusinessId: string | null | undefined;
  activeBusinessId: string | null | undefined;
  isSwitchingBusiness: boolean;
};

function hasCurrentBusinessIdentity(input: DashboardBusinessIdentityInput) {
  return (
    !input.isSwitchingBusiness &&
    input.responseBusinessId != null &&
    input.activeBusinessId != null &&
    input.responseBusinessId === input.activeBusinessId
  );
}

export function isDashboardResponseForActiveBusiness(
  input: DashboardBusinessIdentityInput
) {
  return hasCurrentBusinessIdentity(input);
}

export function isDashboardDayResponseForActiveBusiness(
  input: DashboardBusinessIdentityInput
) {
  return hasCurrentBusinessIdentity(input);
}

export function getDashboardDayAtRiskCustomersForActiveBusiness(input: {
  dashboardDay:
    | {
        businessId?: string | null;
        kpis?: {
          atRiskCustomers?: number | null;
        } | null;
      }
    | null
    | undefined;
  activeBusinessId: string | null | undefined;
  isSwitchingBusiness: boolean;
}) {
  if (
    !isDashboardDayResponseForActiveBusiness({
      responseBusinessId: input.dashboardDay?.businessId,
      activeBusinessId: input.activeBusinessId,
      isSwitchingBusiness: input.isSwitchingBusiness,
    })
  ) {
    return null;
  }

  const atRiskCustomers = input.dashboardDay?.kpis?.atRiskCustomers;
  return typeof atRiskCustomers === 'number' &&
    Number.isFinite(atRiskCustomers)
    ? atRiskCustomers
    : null;
}
