type LifetimeMetrics = {
  totalStampsAllTime?: number | null;
  totalRedemptionsAllTime?: number | null;
};

type DayResponse = {
  businessId?: string | null;
  dateContext?: { rangeDays?: number | null } | null;
  kpis?: {
    stamps?: { value?: number | null } | null;
  } | null;
};

type SummaryResponse = {
  businessId?: string | null;
  lifetimeMetrics?: LifetimeMetrics | null;
};

export type HomeAchievements = {
  stampsAllTime: number;
  redemptionsAllTime: number;
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

export function readHomeAchievements(input: {
  activeBusinessId: string;
  isSwitchingBusiness: boolean;
  summary: SummaryResponse | null | undefined;
}): HomeAchievements | null {
  if (input.isSwitchingBusiness || !input.summary) {
    return null;
  }
  if (!sameBusiness(input.summary.businessId, input.activeBusinessId)) {
    return null;
  }
  const stampsAllTime = finiteCount(
    input.summary.lifetimeMetrics?.totalStampsAllTime
  );
  const redemptionsAllTime = finiteCount(
    input.summary.lifetimeMetrics?.totalRedemptionsAllTime
  );
  if (stampsAllTime === null || redemptionsAllTime === null) {
    return null;
  }
  return { stampsAllTime, redemptionsAllTime };
}

export function readStampsToday(input: {
  activeBusinessId: string;
  isSwitchingBusiness: boolean;
  today: DayResponse | null | undefined;
}): number | null {
  if (input.isSwitchingBusiness || !input.today) {
    return null;
  }
  if (!sameBusiness(input.today.businessId, input.activeBusinessId)) {
    return null;
  }
  if (input.today.dateContext?.rangeDays !== 1) {
    return null;
  }
  return finiteCount(input.today.kpis?.stamps?.value);
}

export function visibleTodayStampCount(count: number | null) {
  if (count == null || count <= 0) {
    return null;
  }
  return count;
}
