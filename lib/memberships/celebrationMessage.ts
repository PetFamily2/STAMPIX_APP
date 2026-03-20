type MembershipCelebrationInput = {
  currentStamps: number;
  maxStamps: number;
};

function formatStampLabel(count: number) {
  return count === 1
    ? '\u05e0\u05d9\u05e7\u05d5\u05d1'
    : '\u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd';
}

export function buildRewardProgressLine({
  currentStamps,
  maxStamps,
}: MembershipCelebrationInput) {
  const safeGoal = Math.max(1, Math.floor(Number(maxStamps) || 0));
  const safeCurrent = Math.max(0, Math.floor(Number(currentStamps) || 0));
  const remaining = Math.max(0, safeGoal - safeCurrent);

  if (remaining === 0) {
    return '\uD83C\uDF81 \u05d4\u05de\u05ea\u05e0\u05d4 \u05de\u05d7\u05db\u05d4 \u05dc\u05da \u05dc\u05de\u05d9\u05de\u05d5\u05e9!';
  }

  return `\uD83C\uDF81 \u05e8\u05e7 \u05e2\u05d5\u05d3 ${remaining} ${formatStampLabel(
    remaining
  )} \u05dc\u05e7\u05d1\u05dc\u05ea \u05d4\u05de\u05ea\u05e0\u05d4!`;
}
