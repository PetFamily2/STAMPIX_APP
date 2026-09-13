export function formatCustomerCount(count: number) {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 1) {
    return 'לקוח אחד';
  }
  return `${safeCount.toLocaleString('he-IL')} לקוחות`;
}

export function formatCustomerResultCount(
  resultCount: number,
  totalCount: number
) {
  const safeResults = Math.max(0, Math.floor(resultCount));
  const safeTotal = Math.max(0, Math.floor(totalCount));
  const resultLabel =
    safeResults === 1
      ? 'תוצאה אחת'
      : `${safeResults.toLocaleString('he-IL')} תוצאות`;
  return `${resultLabel} מתוך ${safeTotal.toLocaleString('he-IL')}`;
}
