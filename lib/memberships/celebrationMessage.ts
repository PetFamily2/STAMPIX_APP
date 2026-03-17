type MembershipCelebrationInput = {
  currentStamps: number;
  maxStamps: number;
};

function formatStampLabel(count: number) {
  return count === 1 ? 'ניקוב' : 'ניקובים';
}

export function buildRewardProgressLine({
  currentStamps,
  maxStamps,
}: MembershipCelebrationInput) {
  const safeGoal = Math.max(1, Math.floor(Number(maxStamps) || 0));
  const safeCurrent = Math.max(0, Math.floor(Number(currentStamps) || 0));
  const remaining = Math.max(0, safeGoal - safeCurrent);

  if (remaining === 0) {
    return '🎁 המתנה מחכה לך למימוש!';
  }

  return `🎁 רק עוד ${remaining} ${formatStampLabel(remaining)} לקבלת המתנה!`;
}
