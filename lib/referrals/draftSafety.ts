export type ReferralDraftBaseline = {
  businessId: string;
  version: number;
  value: string;
};

export function canApplyReferralServerUpdate(
  dirty: boolean,
  saveConflict: boolean
) {
  return !dirty && !saveConflict;
}

export function referralSaveBlocked(input: {
  canEdit: boolean;
  saving: boolean;
  hasBaseline: boolean;
  businessChanged: boolean;
  conflict: boolean;
  saveConflict: boolean;
}) {
  return (
    !input.canEdit ||
    input.saving ||
    !input.hasBaseline ||
    input.businessChanged ||
    input.conflict ||
    input.saveConflict
  );
}

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
