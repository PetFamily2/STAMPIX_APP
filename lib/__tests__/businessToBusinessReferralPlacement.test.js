import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const CUSTOMER_REFERRAL_ROUTE =
  'app/(authenticated)/(business)/settings-business-referrals.tsx';
const B2B_REFERRAL_ROUTE =
  'app/(authenticated)/(business)/settings-business-invite-businesses.tsx';
const SETTINGS_SCREEN = 'screens/BusinessSettingsScreen.tsx';
const DASHBOARD_ROUTE = 'app/(authenticated)/(business)/dashboard.tsx';
const B2B_PATH =
  '/(authenticated)/(business)/settings-business-invite-businesses';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

describe('business-to-business referral placement', () => {
  test('customer referrals remain a Campaigns feature without B2B APIs', () => {
    const source = readSource(CUSTOMER_REFERRAL_ROUTE);

    expect(source).toContain('title="חבר מביא חבר"');
    expect(source).toContain("'/(authenticated)/(business)/campaigns'");
    expect(source).toContain('api.referrals.getReferralConfig');
    expect(source).toContain('api.referrals.getBusinessReferralPerformance');
    expect(source).not.toContain('getBusinessReferralCreditSummary');
    expect(source).not.toContain('getOrCreateBusinessReferralLink');
  });

  test('dedicated B2B route reuses the existing summary and share APIs', () => {
    const source = readSource(B2B_REFERRAL_ROUTE);

    expect(source).toContain('title="הזמנת עסקים"');
    expect(source).toContain('getBusinessReferralCreditSummary');
    expect(source).toContain('getOrCreateBusinessReferralLink');
    expect(source).toContain('summary.creditedMonths');
    expect(source).toContain('summary.pendingMonths');
    expect(source).toContain('summary.remainingCapMonths');
    expect(source).toContain('view_billing_state');
  });

  test('Business Settings exposes only the dedicated B2B entry', () => {
    const source = readSource(SETTINGS_SCREEN);

    expect(source).toContain('title="הזמנת עסקים"');
    expect(source).toContain(B2B_PATH);
    expect(source).not.toContain(
      '/(authenticated)/(business)/settings-business-referrals'
    );
  });

  test('Dashboard places a switching-safe B2B card after Quick Actions', () => {
    const source = readSource(DASHBOARD_ROUTE);
    const quickActionsIndex = source.indexOf('פעולות מהירות');
    const cardIndex = source.lastIndexOf('<DashboardBusinessReferralCard');

    expect(source).toContain('getBusinessReferralCreditSummary');
    expect(source).toContain(B2B_PATH);
    expect(source).toContain('key={String(activeBusinessId)}');
    expect(source).toContain("isSwitchingBusiness ? 'skip'");
    expect(quickActionsIndex).toBeGreaterThan(-1);
    expect(cardIndex).toBeGreaterThan(quickActionsIndex);
    expect(source).not.toContain('api.referrals.getReferralConfig');
    expect(source).not.toContain(
      'api.referrals.getBusinessReferralPerformance'
    );
    expect(source).not.toContain('remainingCapMonths');
  });
});
