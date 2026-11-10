function normalizeCardCopy(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** The printed card keeps both saved fields, and hides a repeated headline. */
export function classicPrintedRewardLine(
  programTitle: string,
  rewardName: string
) {
  const title = normalizeCardCopy(programTitle);
  const reward = normalizeCardCopy(rewardName);
  if (!reward || reward === title) {
    return null;
  }
  return rewardName.trim();
}
