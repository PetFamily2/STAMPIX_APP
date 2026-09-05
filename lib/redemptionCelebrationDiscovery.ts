export type RedemptionCelebrationAvailability = {
  pending: boolean;
  newestConfirmedAt?: number;
};

export function shouldClaimRedemptionCelebration(
  availability: RedemptionCelebrationAvailability | undefined,
  consumedConfirmedAt: number | null
) {
  if (
    availability?.pending !== true ||
    !Number.isFinite(availability.newestConfirmedAt)
  ) {
    return false;
  }
  return (
    consumedConfirmedAt === null ||
    Number(availability.newestConfirmedAt) > consumedConfirmedAt
  );
}

export function rememberConsumedCelebration(
  consumedConfirmedAt: number | null,
  confirmedAt: number
) {
  if (!Number.isFinite(confirmedAt)) {
    return consumedConfirmedAt;
  }
  return consumedConfirmedAt === null
    ? confirmedAt
    : Math.max(consumedConfirmedAt, confirmedAt);
}
