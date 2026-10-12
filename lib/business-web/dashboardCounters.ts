type LifetimeMetrics = {
  totalStampsAllTime?: number | null;
  totalRedemptionsAllTime?: number | null;
  totalCustomersJoinedAllTime?: number | null;
};

type DayKpis = {
  stamps?: { value?: number | null } | null;
  redemptions?: { value?: number | null } | null;
  activeCustomers?: number | null;
  atRiskCustomers?: number | null;
};

type DayResponse = {
  businessId?: string | null;
  dateContext?: { rangeDays?: number | null } | null;
  kpis?: DayKpis | null;
};

type SummaryResponse = {
  businessId?: string | null;
  lifetimeMetrics?: LifetimeMetrics | null;
};

export type BusinessDashboardCounters = {
  stampsAllTime: number;
  redemptionsAllTime: number;
  customersAllTime: number;
  stampsToday: number;
  redemptionsToday: number;
  stampsLast30Days: number;
  activeCustomers: number;
  atRiskCustomers: number;
};

function finiteCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sameBusiness(
  responseBusinessId: string | null | undefined,
  activeBusinessId: string
) {
  return (
    responseBusinessId != null &&
    String(responseBusinessId) === activeBusinessId
  );
}

export function readBusinessDashboardCounters(input: {
  activeBusinessId: string;
  isSwitchingBusiness: boolean;
  summary: SummaryResponse | null | undefined;
  today: DayResponse | null | undefined;
  month: DayResponse | null | undefined;
}): BusinessDashboardCounters | null {
  if (input.isSwitchingBusiness) {
    return null;
  }
  if (!input.summary || !input.today || !input.month) {
    return null;
  }
  if (
    !sameBusiness(input.summary.businessId, input.activeBusinessId) ||
    !sameBusiness(input.today.businessId, input.activeBusinessId) ||
    !sameBusiness(input.month.businessId, input.activeBusinessId)
  ) {
    return null;
  }
  if (input.today.dateContext?.rangeDays !== 1) {
    return null;
  }
  if (input.month.dateContext?.rangeDays !== 30) {
    return null;
  }

  const stampsAllTime = finiteCount(
    input.summary.lifetimeMetrics?.totalStampsAllTime
  );
  const redemptionsAllTime = finiteCount(
    input.summary.lifetimeMetrics?.totalRedemptionsAllTime
  );
  const customersAllTime = finiteCount(
    input.summary.lifetimeMetrics?.totalCustomersJoinedAllTime
  );
  const stampsToday = finiteCount(input.today.kpis?.stamps?.value);
  const redemptionsToday = finiteCount(input.today.kpis?.redemptions?.value);
  const stampsLast30Days = finiteCount(input.month.kpis?.stamps?.value);
  const activeCustomers = finiteCount(input.today.kpis?.activeCustomers);
  const atRiskCustomers = finiteCount(input.today.kpis?.atRiskCustomers);

  if (
    stampsAllTime === null ||
    redemptionsAllTime === null ||
    customersAllTime === null ||
    stampsToday === null ||
    redemptionsToday === null ||
    stampsLast30Days === null ||
    activeCustomers === null ||
    atRiskCustomers === null
  ) {
    return null;
  }

  return {
    stampsAllTime,
    redemptionsAllTime,
    customersAllTime,
    stampsToday,
    redemptionsToday,
    stampsLast30Days,
    activeCustomers,
    atRiskCustomers,
  };
}
