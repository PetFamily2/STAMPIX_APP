export const REFERRAL_COPY = {
  hubHeading: 'הזמינו עסקים. צברו חודשי StampAix.',
  inviteCta: 'הזמנת עסק',
  copyLink: 'העתקת קישור',
  redeemCta: 'מימוש ההטבה',
  shareBenefit: 'אחרי 12 חודשי מנוי בתשלום תקבלו חודש StampAix במתנה',
  shareMessage:
    'הצטרפו ל-StampAix דרך ההזמנה שלנו.\nאחרי 12 חודשי מנוי בתשלום תקבלו חודש במתנה.',
  referredOnboardingSaved: 'ההזמנה מ-{businessName} נשמרה',
  referredOnboardingBenefit:
    'אחרי 12 חודשי מנוי בתשלום תקבלו חודש StampAix במתנה',
  paywallBenefitNote: 'הטבת הזמנה: חודש מתנה לאחר 12 חודשי מנוי בתשלום',
  landingTitle: 'הזמנה ל-StampAix',
  landingDescription:
    'הצטרפו דרך {businessName} וקבלו חודש StampAix במתנה לאחר 12 חודשי מנוי בתשלום',
  landingBenefit:
    'הצטרפו דרך עסק וקבלו חודש StampAix במתנה לאחר 12 חודשי מנוי בתשלום',
  inviteCodeFallback: 'קוד ההזמנה שלכם',
  haveInviteCode: 'יש לכם קוד הזמנה?',
  joinViaBusiness: 'מצטרפים דרך {businessName}',
  earnedOneMonth: 'הרווחתם חודש StampAix במתנה',
  earnedTwoMonths: 'הרווחתם חודשיים StampAix במתנה',
  rewardActivated: 'ההטבה הופעלה',
  referredQualified: 'עמדתם בתנאי ההטבה',
  referredRewardWaiting: 'חודש StampAix במתנה מחכה לכם',
  verifyingSubscription: 'מאמתים את המנוי',
  canceledAtDate: 'המנוי יבוטל בתאריך {date}',
  yearlyValue10of12: '12 חודשים במחיר של 10',
  yearlySaveMonths: 'חוסכים חודשיים',
} as const;

export function formatReferralCopy(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

export function referralStatusLabel(status: string): string {
  switch (status) {
    case 'created':
    case 'claimed':
      return 'ממתין להשלמת תנאי ההטבה';
    case 'subscription_started':
    case 'qualification_pending':
      return 'ממתין להשלמת תנאי ההטבה';
    case 'qualified':
    case 'reward_created':
      return 'ההטבה הבשילה';
    case 'skipped':
    case 'revoked':
      return 'ההטבה אינה זמינה';
    case 'pending':
      return 'ממתין';
    case 'earned':
      return 'נצבר';
    case 'scheduled':
      return 'ממתין למועד הזכאות';
    case 'redeemable':
      return 'מוכן למימוש';
    case 'redeeming':
      return 'בתהליך מימוש';
    case 'redeemed':
      return 'מומש';
    case 'failed':
      return 'לא הושלם';
    default:
      return 'בתהליך';
  }
}

export function qualificationProgressLabel(completed: number, required: number) {
  return `השלים ${completed} מתוך ${required} חודשי זכאות`;
}

export function earnedRewardLabel(months: number) {
  if (months === 1) {
    return 'הרווחתם חודש';
  }
  if (months === 2) {
    return 'הרווחתם חודשיים';
  }
  return `הרווחתם ${months} חודשים`;
}
