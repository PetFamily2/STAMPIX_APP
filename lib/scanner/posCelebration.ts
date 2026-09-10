export const POS_REDEMPTION_CELEBRATION_DURATION_MS = 1_100;

export function shouldAnimatePosRedemptionCelebration(reduceMotion: boolean) {
  return !reduceMotion;
}

export function shouldAnimateRewardReadyCue(reduceMotion: boolean) {
  return !reduceMotion;
}
