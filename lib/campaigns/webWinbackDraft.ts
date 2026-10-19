export function buildWebWinbackDraft(input: {
  days: string;
  mode: 'invite' | 'offer';
  offer: string;
}) {
  const days = Number(input.days.trim());
  if (
    !/^\d+$/.test(input.days.trim()) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    throw new Error('בחרו מספר שלם של ימי חוסר פעילות, בין 1 ל־365.');
  }
  const offer = input.offer.trim();
  if (input.mode === 'offer' && (offer.length < 3 || offer.length > 400)) {
    throw new Error('פרטו את ההצעה ללקוח, בין 3 ל־400 תווים.');
  }
  return {
    type: 'winback' as const,
    title: 'קמפיין החזרת לקוחות',
    messageTitle:
      input.mode === 'offer' ? 'מחכה לכם הצעה מיוחדת' : 'מתגעגעים אליכם',
    messageBody:
      input.mode === 'offer'
        ? `נשמח לראות אתכם שוב! ${offer}`
        : 'לא ראינו אתכם לאחרונה ונשמח לארח אתכם שוב. מחכים לכם בביקור הבא!',
    rules: { audience: 'inactive_days' as const, daysInactive: days },
  };
}
