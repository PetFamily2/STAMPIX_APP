import { describe, expect, test } from 'bun:test';

import { getBusinessReferralDashboardCopy } from '../dashboard/businessReferralCopy';

describe('business referral dashboard copy', () => {
  test('uses the default growth message without inventing metrics', () => {
    expect(getBusinessReferralDashboardCopy(undefined)).toEqual({
      title: 'הזמינו עסק ל-StampAix',
      supportingText: 'קבלו חודשי שימוש מתנה',
    });
  });

  test('uses pending invitation count with practical Hebrew pluralization', () => {
    expect(
      getBusinessReferralDashboardCopy({
        creditedMonths: 0,
        pendingInvitesCount: 1,
      })
    ).toEqual({
      title: 'יש לכם הזמנה בדרך 🎉',
      supportingText: 'עסק אחד בתהליך',
    });

    expect(
      getBusinessReferralDashboardCopy({
        creditedMonths: 0,
        pendingInvitesCount: 3,
      }).supportingText
    ).toBe('3 עסקים בתהליך');
  });

  test('prioritizes earned credit and distinguishes one from multiple months', () => {
    expect(
      getBusinessReferralDashboardCopy({
        creditedMonths: 1,
        pendingInvitesCount: 1,
      }).title
    ).toBe('קיבלתם חודש מתנה 🎁');

    expect(
      getBusinessReferralDashboardCopy({
        creditedMonths: 4,
        pendingInvitesCount: 0,
      }).title
    ).toBe('קיבלתם 4 חודשי שימוש מתנה 🎁');
  });
});
