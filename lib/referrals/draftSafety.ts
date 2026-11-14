export type ReferralDraftBaseline = {
  businessId: string;
  version: number;
  value: string;
};

export function referralDraftState(
  baseline: ReferralDraftBaseline | null,
  businessId: string,
  value: string,
  serverVersion: number | undefined
) {
  const dirty = baseline !== null && value !== baseline.value;
  return {
    dirty,
    businessChanged: baseline !== null && baseline.businessId !== businessId,
    conflict:
      baseline !== null &&
      baseline.businessId === businessId &&
      dirty &&
      serverVersion !== undefined &&
      serverVersion !== baseline.version,
  };
}
