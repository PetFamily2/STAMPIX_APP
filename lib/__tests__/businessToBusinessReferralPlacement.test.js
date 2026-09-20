import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { BUSINESS_ROUTES } from '../navigation/businessRoutes';

const CUSTOMER_REFERRAL_ROUTE =
  'app/(authenticated)/(business)/settings-business-referrals.tsx';
const CAMPAIGNS_ROUTE = 'app/(authenticated)/(business)/cards/campaigns.tsx';
const B2B_REFERRAL_ROUTE =
  'app/(authenticated)/(business)/settings-business-invite-businesses.tsx';
const SETTINGS_SCREEN = 'screens/BusinessSettingsScreen.tsx';
const DASHBOARD_ROUTE = 'app/(authenticated)/(business)/dashboard.tsx';
const SUBSCRIPTION_ROUTE =
  'app/(authenticated)/(business)/settings-business-subscription.tsx';
const B2B_PATH =
  '/(authenticated)/(business)/settings-business-invite-businesses';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

describe('business-to-business referral placement', () => {
  test('customer referrals remain a Campaigns feature without B2B APIs', () => {
    const source = readSource(CUSTOMER_REFERRAL_ROUTE);
    const campaigns = readSource(CAMPAIGNS_ROUTE);

    expect(source).toContain('title="קמפיין חבר מביא חבר"');
    expect(source).toContain(
      'fallbackHref="/(authenticated)/(business)/campaigns"'
    );
    expect(campaigns).toContain(
      "'/(authenticated)/(business)/settings-business-referrals'"
    );
    expect(source).toContain('api.referrals.getReferralConfig');
    expect(source).toContain('api.referrals.getBusinessReferralPerformance');
    expect(source).not.toContain('getBusinessReferralCreditSummary');
    expect(source).not.toContain('getOrCreateBusinessReferralLink');
  });

  test('dedicated B2B route reuses the existing summary and share APIs', () => {
    const source = readSource(B2B_REFERRAL_ROUTE);

    expect(source).toContain('title="הזמנת עסקים"');
    expect(source).toContain('getBusinessReferralHub');
    expect(source).toContain('getOrCreateBusinessReferralLink');
    expect(source).toContain('hub.metrics');
    expect(source).toContain('invite_businesses');
    expect(source).not.toContain('view_billing_state');
    expect(source).toContain(
      'fallbackHref="/(authenticated)/(business)/dashboard"'
    );
  });

  test('Business Settings and billing expose no B2B management entry', () => {
    const source = readSource(SETTINGS_SCREEN);
    const subscription = readSource(SUBSCRIPTION_ROUTE);

    expect(source).not.toContain('title="הזמנת עסקים"');
    expect(source).not.toContain('BUSINESS_ROUTES.inviteBusinesses');
    expect(subscription).not.toContain('getBusinessReferralCreditSummary');
    expect(subscription).not.toContain('getOrCreateBusinessReferralLink');
    expect(subscription).not.toContain('הפניית עסקים');
    expect(BUSINESS_ROUTES.inviteBusinesses).toBe(B2B_PATH);
    expect(source).not.toContain(
      '/(authenticated)/(business)/settings-business-referrals'
    );
  });

  test('Dashboard places one switching-safe B2B card between recommendations and snapshot', () => {
    const source = readSource(DASHBOARD_ROUTE);
    const recommendationPanelIndex = source.lastIndexOf(
      '<DashboardRecommendationsSection'
    );
    const cardMatches = source.match(/<DashboardBusinessReferralCard/g) ?? [];
    const cardIndex = source.lastIndexOf('<DashboardBusinessReferralCard');
    const snapshotIndex = source.indexOf('תמונת מצב', cardIndex);
    const quickActionsIndex = source.indexOf('פעולות מהירות', snapshotIndex);

    expect(source).toContain('getBusinessReferralCreditSummary');
    expect(source).toContain(B2B_PATH);
    expect(source).toContain('key={String(activeBusinessId)}');
    expect(source).toContain("isSwitchingBusiness ? 'skip'");
    expect(source).toContain('invite_businesses');
    expect(cardMatches).toHaveLength(1);
    expect(cardIndex).toBeGreaterThan(recommendationPanelIndex);
    expect(snapshotIndex).toBeGreaterThan(cardIndex);
    expect(quickActionsIndex).toBeGreaterThan(snapshotIndex);
    expect(source).not.toContain('api.referrals.getReferralConfig');
    expect(source).not.toContain(
      'api.referrals.getBusinessReferralPerformance'
    );
    expect(source).not.toContain('remainingCapMonths');
  });

  test('Dashboard B2B CTA retains readable compact primary styling', () => {
    const source = readSource(DASHBOARD_ROUTE);

    expect(source).toContain("backgroundColor: '#2F6BFF'");
    expect(source).toContain("color: '#FFFFFF'");
    expect(source).toContain('paddingVertical: 7');
    expect(source).toContain('paddingHorizontal: 20');
    expect(source).toContain('minWidth: 168');
    expect(source).toContain('borderRadius: 999');
    expect(source).toContain('businessReferralButtonPressed');
    expect(source).toContain('businessReferralButtonDisabled');
    expect(source).toContain('opacity: 0.88');
    expect(source).toContain("fontWeight: '800'");
  });

  test('Business Settings exposes owner billing without exposing B2B access', () => {
    const source = readSource(SETTINGS_SCREEN);

    expect(source).not.toContain('canInviteBusinesses');
    expect(source).not.toContain('invite_businesses === true');
    expect(source).toContain('canManageSubscription');
    expect(source).toContain(
      'activeBusinessCapabilities?.manage_subscription === true'
    );
    expect(source).toContain('title="המסלול שלי"');
  });
});
