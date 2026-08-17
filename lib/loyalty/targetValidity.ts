export function isValidLoyaltyTarget(value: number) {
  return Number.isFinite(value) && Math.floor(value) >= 1;
}
