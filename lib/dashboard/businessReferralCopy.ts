export type BusinessReferralDashboardSummary = {
  creditedMonths: number;
  pendingInvitesCount: number;
};

export type BusinessReferralDashboardCopy = {
  title: string;
  supportingText: string;
};

const HEBREW_NUMBER_FORMATTER = new Intl.NumberFormat('he-IL', {
  maximumFractionDigits: 0,
});

export function getBusinessReferralDashboardCopy(
  summary: BusinessReferralDashboardSummary | null | undefined
): BusinessReferralDashboardCopy {
  if (summary && summary.creditedMonths > 0) {
    if (summary.creditedMonths === 1) {
      return {
        title: 'קיבלתם חודש מתנה 🎁',
        supportingText: 'ההטבה נוספה לחשבון העסק',
      };
    }

    return {
      title: `קיבלתם ${HEBREW_NUMBER_FORMATTER.format(summary.creditedMonths)} חודשי שימוש מתנה 🎁`,
      supportingText: 'ההטבה נוספה לחשבון העסק',
    };
  }

  if (summary && summary.pendingInvitesCount > 0) {
    return {
      title: 'יש לכם הזמנה בדרך 🎉',
      supportingText:
        summary.pendingInvitesCount === 1
          ? 'עסק אחד בתהליך'
          : `${HEBREW_NUMBER_FORMATTER.format(summary.pendingInvitesCount)} עסקים בתהליך`,
    };
  }

  return {
    title: 'הזמינו עסק ל-StampAix',
    supportingText: 'קבלו חודשי שימוש מתנה',
  };
}
