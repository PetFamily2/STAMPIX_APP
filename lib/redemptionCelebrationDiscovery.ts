export type RedemptionCelebrationAvailability = {
  pending: boolean;
  newestConfirmedAt?: number;
};

export function isRedemptionCelebrationForeground(
  appState: string | null | undefined
) {
  // React Native can report `unknown` while the JS runtime is already visible.
  // Treat only true background/inactive transitions as "do not claim yet".
  return appState !== 'background' && appState !== 'inactive';
}

export function shouldClaimRedemptionCelebration(
  availability: RedemptionCelebrationAvailability | undefined,
  consumedConfirmedAt: number | null,
  appState: string | null | undefined = 'active'
) {
  if (
    availability?.pending !== true ||
    !Number.isFinite(availability.newestConfirmedAt) ||
    !isRedemptionCelebrationForeground(appState)
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
